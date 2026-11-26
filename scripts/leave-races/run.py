#!/usr/bin/env python3
"""Synthetic-only PostgreSQL multi-process RPC races; never accepts a remote DSN."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
MARKER = 'DXT_DISPOSABLE_LEAVE_RACE_DATABASE'
BENEFIT_SHA = '2bd5e0c9fc284a49f555055b8393d867d8084fb1'
BENEFIT_FILE = 'supabase/migrations/20261126045159_leave_benefit_review_apply.sql'

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def validate_target(database, port):
    if not re.fullmatch(r'dxt_leave_race_[a-z0-9_]{1,40}', database):
        raise ValueError('Use a fresh dxt_leave_race_<suffix> disposable database')
    if not 1024 <= port <= 65535:
        raise ValueError('Use an explicit local unprivileged port')

class Harness:
    def __init__(self, args):
        validate_target(args.database, args.port)
        if not shutil.which('psql'):
            raise RuntimeError('psql is unavailable; no database execution performed')
        self.env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
        # No URL/service-file/host override and no interactive password prompting.
        self.cmd = ['psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1',
                    '-p',str(args.port),'-U',args.user,'-d',args.database]
        self.children = []
        self.results = []
    def sql(self, sql):
        p = subprocess.run(self.cmd, input="set statement_timeout='15s';\n"+sql,
                           text=True,capture_output=True,env=self.env,timeout=20)
        if p.returncode:
            raise RuntimeError(p.stderr.strip())
        return p.stdout.strip()
    def process(self, sql):
        p=subprocess.Popen(self.cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE,text=True,bufsize=1,env=self.env)
        self.children.append(p)
        p.stdin.write(sql+'\n');p.stdin.flush()
        return p
    def line(self,p,expected):
        # psql unaligned output contains just one readiness row before the blocking SQL.
        selector=selectors.DefaultSelector();selector.register(p.stdout,selectors.EVENT_READ)
        deadline=time.monotonic()+15;buffer=b''
        try:
            while time.monotonic()<deadline:
                if selector.select(max(0,deadline-time.monotonic())):
                    chunk=os.read(p.stdout.fileno(),4096)
                    buffer+=chunk
                    if expected.encode() in buffer.splitlines():return
                    if p.poll() is not None:break
            raise RuntimeError('Barrier not reached: '+expected)
        finally:selector.close()
    def check(self, condition, message):
        if self.sql('select ('+condition+')::text;') != 'true':
            raise AssertionError(message)
    def actor(self, actor, sql):
        return ("set local role authenticated;select set_config('request.jwt.claim.sub',"+
                literal(actor)+",true);select set_config('request.jwt.claims',"+
                literal(json.dumps({'sub':actor,'role':'authenticated'}))+",true);"+sql)
    def call(self,actor,sql):
        return self.sql('begin;'+self.actor(actor,sql)+';commit;').splitlines()[-1]
    def race(self,label,actor,first,second,error):
        tag='dxt_race_'+uuid.uuid4().hex[:12];key=int(uuid.uuid4().hex[:12],16)
        controller=self.process(f"select pg_advisory_lock({key});\nselect 'CONTROL_READY';")
        self.line(controller,'CONTROL_READY')
        one=self.process(f"set application_name={literal(tag+'_1')};set statement_timeout='20s';begin;"+
                         self.actor(actor,first)+f";select 'FIRST_MUTATED';select pg_advisory_xact_lock({key});commit;")
        self.line(one,'FIRST_MUTATED')
        two=self.process(f"set application_name={literal(tag+'_2')};set statement_timeout='20s';begin;"+
                         self.actor(actor,second)+';commit;')
        # Explicit evidence that worker2 waits on worker1's transaction, not merely a timed sleep.
        observed=False;deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            blocked=self.sql("select json_build_object('waiter_pid',w.pid,'holder_pid',h.pid,"
                             "'wait_event_type',w.wait_event_type,'wait_event',w.wait_event,"
                             "'blockers',pg_blocking_pids(w.pid)) from pg_stat_activity w join pg_stat_activity h "
                             "on h.pid=any(pg_blocking_pids(w.pid)) where w.application_name="+
                             literal(tag+'_2')+" and h.application_name="+literal(tag+'_1')+
                             " and w.wait_event_type='Lock';")
            if blocked:observed=json.loads(blocked);break
            if two.poll() is not None:break
            time.sleep(.05)
        if not observed:raise AssertionError(label+': no genuine competing PostgreSQL lock observed')
        controller.stdin.write(f'select pg_advisory_unlock({key});\n\\q\n');controller.stdin.flush()
        controller.stdin.close();one.stdin.close();two.stdin.close()
        one.wait(timeout=20);two.wait(timeout=20);controller.wait(timeout=20)
        first_error=one.stderr.read();second_error=two.stderr.read()
        if one.returncode or (error and (not two.returncode or error not in second_error)) or (not error and two.returncode):
            raise AssertionError(label+': unexpected outcomes '+first_error+second_error)
        self.results.append({'scenario':label,'blocking_observed':True,'lock_evidence':observed,'winner_committed':True,
                             'contender':error or 'success'})
    def close(self):
        for p in self.children:
            if p.poll() is None:p.terminate()
        for p in self.children:
            try:p.wait(timeout=3)
            except subprocess.TimeoutExpired:p.kill();p.wait()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',required=True);parser.add_argument('--port',required=True,type=int)
    parser.add_argument('--user',default='postgres');parser.add_argument('--ack-disposable',required=True,choices=[MARKER])
    parser.add_argument('--benefits-migration',type=Path,default=ROOT/BENEFIT_FILE);parser.add_argument('--benefits-sha',choices=[BENEFIT_SHA]);parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args()
    if args.report.exists():raise RuntimeError('Report already exists; choose a new output path')
    h=Harness(args)
    try:
        h.check("inet_server_addr()='127.0.0.1'::inet",'Not a local PostgreSQL server')
        h.check("shobj_description((select oid from pg_database where datname=current_database()),'pg_database')="+literal(MARKER),'Missing disposable database marker')
        h.check("(select rolsuper from pg_roles where rolname=current_user)",'Synthetic fixture requires local cluster superuser')
        h.check("not exists(select 1 from public.employee) and not exists(select 1 from auth.users)",'Database is not empty; refuse to touch existing identities')
        h.check("to_regprocedure('public.correct_leave_source(uuid,numeric,text,integer)') is not null",'Apply reviewed main migrations first')
        if args.benefits_sha:
            pinned=subprocess.check_output(['git','show',BENEFIT_SHA+':'+BENEFIT_FILE],cwd=ROOT)
            if not args.benefits_migration.exists() or args.benefits_migration.read_bytes()!=pinned:
                raise RuntimeError('Benefit migration does not match the exact opt-in branch SHA')
            h.check("to_regprocedure('public.apply_leave_benefit(uuid,jsonb,text,boolean)') is not null",'Conditional #54 migration not installed')
        else:
            h.check("to_regprocedure('public.apply_leave_benefit(uuid,jsonb,text,boolean)') is null",'Benefit schema requires explicit --benefits-sha')
        owner,peer,admin,emp,other,dept=[str(uuid.uuid4()) for _ in range(6)]
        # Only fixed synthetic identities; no real names, emails, balances or Google sessions.
        h.sql("begin;insert into auth.users(id,email) values ("+literal(owner)+",'race-owner@example.test'),("+literal(peer)+",'race-peer@example.test'),("+literal(admin)+",'race-admin@example.test');"+
              "insert into app_memberships(user_id,display_name,roles) values ("+literal(owner)+",'RACE OWNER',array['EMPLOYEE']),("+literal(peer)+",'RACE PEER',array['EMPLOYEE']),("+literal(admin)+",'RACE ADMIN',array['ADMIN']);"+
              "insert into organization(id,name) values ("+literal(dept)+",'RACE SYNTHETIC');"+
              "insert into employee(id,name,company_email,title,hire_date,auth_user_id,department_id) values ("+literal(emp)+",'RACE OWNER','race-owner@example.test','TEST','2025-01-01',"+literal(owner)+","+literal(dept)+"),("+literal(other)+",'RACE PEER','race-peer@example.test','TEST','2025-01-01',"+literal(peer)+","+literal(dept)+");"+
              "insert into employee_role(employee_id,role) values ("+literal(emp)+",'EMPLOYEE'),("+literal(other)+",'EMPLOYEE');"+
              "create or replace function public.leave_today() returns date language sql stable as $$select date '2026-11-20'$$;commit;")
        source=str(uuid.uuid4())
        h.call(admin,f"select grant_leave_source('{source}','{emp}',2026,'ANNUAL',1,'SYNTHETIC race allowance',0)")
        calendar=h.sql('select version from holiday_year where year=2026;')
        def request(day):
            rid=str(uuid.uuid4());h.call(owner,f"select submit_leave_benefit('{rid}','{day}','{day}','FULL_DAY','','',{calendar},'ANNUAL','')");return rid
        def review(rid,version,action):
            return 'select review_leave('+literal(json.dumps([{'id':rid,'version':version}]))+','+literal(action)+",'SYNTHETIC race')"
        a,b=request('2026-11-23'),request('2026-11-24')
        h.race('approval competing for last day',admin,review(a,1,'APPROVED'),review(b,1,'APPROVED'),'INSUFFICIENT_BALANCE')
        h.check(f"(select status='APPROVED' from leave_request where id='{a}') and (select status='PENDING' from leave_request where id='{b}') and leave_source_balance('{source}')=0",'Overdraft or lost approval')
        h.race('same approved request cancellation',admin,review(a,2,'CANCELLED'),review(a,2,'CANCELLED'),'STALE_LEAVE')
        h.check(f"leave_source_balance('{source}')=1 and (select count(*)=1 from leave_ledger where request_id='{a}' and event_type='REVERSAL')",'Duplicate or missing reversal')
        ver=h.sql(f"select version from leave_account where employee_id='{emp}' and year=2026 and bucket='ANNUAL';")
        h.race('approval invalidates source correction',admin,review(b,1,'APPROVED'),f"select correct_leave_source('{source}',1,'SYNTHETIC stale correction',{ver})",'STALE_LEAVE')
        h.check(f"leave_source_balance('{source}')=0 and (select count(*)=0 from leave_ledger where source_id='{source}' and note='SYNTHETIC stale correction')",'Stale correction wrote money')
        # Cancellation and negative correction cannot silently lose a restored day.
        ver=h.sql(f"select version from leave_account where employee_id='{emp}' and year=2026 and bucket='ANNUAL';")
        h.race('cancellation invalidates source correction',admin,review(b,2,'CANCELLED'),f"select correct_leave_source('{source}',1,'SYNTHETIC stale correction',{ver})",'STALE_LEAVE')
        h.check(f"leave_source_balance('{source}')=1",'Cancellation restoration lost')
        c=request('2026-11-25')
        ver=h.sql(f"select version from leave_account where employee_id='{emp}' and year=2026 and bucket='ANNUAL';")
        h.race('source correction wins before approval',admin,f"select correct_leave_source('{source}',1,'SYNTHETIC reduce allowance',{ver})",review(c,1,'APPROVED'),'INSUFFICIENT_BALANCE')
        h.check(f"leave_source_balance('{source}')=0 and (select status='PENDING' from leave_request where id='{c}')",'Correction-first overdraft')
        ver=h.sql(f"select version from leave_account where employee_id='{emp}' and year=2026 and bucket='ANNUAL';")
        source=str(uuid.uuid4())
        h.call(admin,f"select grant_leave_source('{source}','{emp}',2026,'ANNUAL',2,'SYNTHETIC independent allowance',{ver})")
        h.call(admin,review(c,1,'APPROVED'))
        ver=h.sql(f"select version from leave_account where employee_id='{emp}' and year=2026 and bucket='ANNUAL';")
        h.race('source correction before cancellation preserves both',admin,f"select correct_leave_source('{source}',1,'SYNTHETIC independent correction',{ver})",review(c,2,'CANCELLED'),None)
        h.check(f"leave_source_balance('{source}')=1",'Correction or cancellation lost')
        if args.benefits_sha:
            run_benefits(h,owner,admin,emp,source)
        h.check('not exists(select 1 from leave_ledger r join leave_ledger d on d.id=r.reversal_of where r.source_id<>d.source_id or r.amount_delta<>-d.amount_delta)','Reversal changed source/amount')
        report={'executed':True,'engine':h.sql('select version();'),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                'executed_at':datetime.now(timezone.utc).isoformat(),'harness_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'bootstrap_sha256':hashlib.sha256(Path(__file__).with_name('bootstrap.sql').read_bytes()).hexdigest(),'provisioner_sha256':hashlib.sha256(Path(__file__).with_name('disposable.sh').read_bytes()).hexdigest(),'benefits_migration_sha256':hashlib.sha256(args.benefits_migration.read_bytes()).hexdigest() if args.benefits_sha else None,'benefits_sha':args.benefits_sha,'synthetic_only':True,'google_auth_uat':False,'scenarios':h.results,
                'installed_function_sha256':{fn:hashlib.sha256(h.sql('select pg_get_functiondef('+literal(fn)+'::regprocedure);').encode()).hexdigest() for fn in ['public.review_leave(jsonb,text,text)','public.correct_leave_source(uuid,numeric,text,integer)','public.grant_leave_source(uuid,uuid,integer,text,numeric,text,integer)']},
                'repository_migration_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))}}
        args.report.write_text(json.dumps(report,indent=2)+'\n')
        print('PASS: '+str(len(h.results))+' real PostgreSQL races; synthetic database retained for inspection')
    finally:h.close()


def run_benefits(h,owner,admin,emp,source):
    """Only available on the explicitly pinned, separately reviewed #54 stack."""
    work=str(uuid.uuid4());op=str(uuid.uuid4())
    h.call(owner,f"select submit_weekend_work('{work}','2026-11-14',540,1080,60,null,'SYNTHETIC weekend evidence')")
    h.call(admin,f"select decide_weekend_work('{work}',1,'APPROVED')")
    plan=h.call(admin,f"select preview_leave_benefit('WEEKEND','{work}',null)::text")
    call=lambda oid: f"select apply_leave_benefit('{oid}',{literal(plan)}::jsonb,'SYNTHETIC prior grants reconciled',true)"
    h.race('weekend competing apply different keys',admin,call(op),call(str(uuid.uuid4())),'BENEFIT_ALREADY_LINKED')
    h.check(f"(select count(*)=1 from leave_benefit_operation where work_id='{work}')",'Duplicate weekend grant')
    h.race('weekend exact replay',admin,call(op),call(op),None)
    version=lambda:h.sql(f"select version from leave_account where employee_id='{emp}' and year=2026 and bucket='ANNUAL';")
    reverse=lambda operation,v,reason:f"select reverse_leave_benefit('{operation}',{v},{literal(reason)})"
    reason='SYNTHETIC exact reversal'
    v=version();undo=reverse(op,v,reason)
    h.race('duplicate benefit reversal exact replay',admin,undo,undo,None)
    h.check(f"(select count(*)=1 from leave_benefit_reversal where operation_id='{op}') and (select leave_source_balance(to_source)=0 from leave_benefit_operation where id='{op}')",'Duplicate benefit reversal')
    def fresh_work(day):
        wid=str(uuid.uuid4());oid=str(uuid.uuid4())
        h.call(owner,f"select submit_weekend_work('{wid}','{day}',540,1080,60,null,'SYNTHETIC weekend evidence')")
        h.call(admin,f"select decide_weekend_work('{wid}',1,'APPROVED')")
        fresh=h.call(admin,f"select preview_leave_benefit('WEEKEND','{wid}',null)::text")
        apply=f"select apply_leave_benefit('{oid}',{literal(fresh)}::jsonb,'SYNTHETIC prior grants reconciled',true)"
        return wid,oid,apply
    cancel=lambda wid,v,reason:f"select cancel_approved_weekend_work('{wid}',2,{v},{literal(reason)})"
    for day,cancel_first in [('2026-11-07',True),('2026-11-08',False)]:
        wid,oid,apply=fresh_work(day);h.call(admin,apply);v=version()
        reason='SYNTHETIC atomic work cancellation'
        cancellation=cancel(wid,v,reason);reversal=reverse(oid,v,reason)
        h.race('work cancellation versus reversal '+('cancel-first' if cancel_first else 'reverse-first'),admin,cancellation if cancel_first else reversal,reversal if cancel_first else cancellation,None)
        h.check(f"(select status='CANCELLED' from weekend_work where id='{wid}') and (select count(*)=1 from leave_benefit_reversal where operation_id='{oid}') and (select leave_source_balance(to_source)=0 from leave_benefit_operation where id='{oid}')",'Cancellation/reversal not atomic')
    wid,oid,apply=fresh_work('2026-11-15');v=version()
    h.race('apply before cancellation detects stale balance',admin,apply,cancel(wid,v,'SYNTHETIC cancel stale version'),'STALE_LEAVE')
    h.check(f"(select status='APPROVED' from weekend_work where id='{wid}') and not exists(select 1 from weekend_work_void where work_id='{wid}')",'Stale cancellation partially wrote')
    h.call(admin,cancel(wid,version(),'SYNTHETIC cancel fresh version'))
    wid,oid,apply=fresh_work('2026-11-01');v=version()
    h.race('cancellation before apply denies obsolete plan',admin,cancel(wid,v,'SYNTHETIC cancel before grant'),apply,'APPROVED_WORK_REQUIRED')
    h.check(f"not exists(select 1 from leave_benefit_operation where work_id='{wid}')",'Cancelled work paid')
    # Candidate capture uses Nov30 project evidence; no fake source import/backdating.
    h.sql("create or replace function public.leave_today() returns date language sql stable as $$select date '2026-12-01'$$;")
    case=h.call(admin,f"select capture_carryover_evidence('{emp}',2026,'MANUAL_RECONCILIATION','SYNTHETIC dated external project','2027-02-28',0,true)")
    h.call(admin,f"select review_carryover_candidate('{case}',1,'CONFIRMED','SYNTHETIC source review')")
    h.sql("create or replace function public.leave_today() returns date language sql stable as $$select date '2027-01-04'$$;")
    # Current real server timestamp must be <= 2026-12-31: never alter immutable monetary timestamps.
    h.check("(now() at time zone 'Asia/Seoul')::date<=date '2026-12-31'",'Fixture cutoff expired; redesign synthetic fixture dates, do not backdate ledger')
    plan=h.call(admin,f"select preview_leave_benefit('CARRYOVER','{case}','{source}')::text")
    op=str(uuid.uuid4());other=str(uuid.uuid4())
    call=lambda oid:f"select apply_leave_benefit('{oid}',{literal(plan)}::jsonb,'SYNTHETIC year-end reconciled',true)"
    capture=lambda version:f"select capture_carryover_evidence('{emp}',2026,'MANUAL_RECONCILIATION','SYNTHETIC refreshed project evidence','2027-02-28',{version},true)"
    h.race('carryover capture before apply uses shared advisory order',admin,capture(2),call(op),'CONFIRMED_CARRYOVER_SOURCE_REQUIRED')
    h.check(f"leave_source_balance('{source}')=1 and not exists(select 1 from leave_benefit_operation where from_source='{source}')",'Changed evidence moved money')
    h.call(admin,f"select review_carryover_candidate('{case}',3,'CONFIRMED','SYNTHETIC renewed review')")
    plan=h.call(admin,f"select preview_leave_benefit('CARRYOVER','{case}','{source}')::text")
    h.race('carryover competing apply different keys',admin,call(op),call(other),'BENEFIT_ALREADY_LINKED')
    h.check(f"leave_source_balance('{source}')=0 and (select sum(days)=1 and count(*)=1 from leave_benefit_operation where from_source='{source}')",'Carryover not conserved')
    h.check(f"(select v.valid_until=date '2027-12-31' from leave_benefit_operation o join leave_source_validity v on v.source_id=o.to_source where o.id='{op}')",'Receiving-year validity changed')
    h.race('carryover apply replay before capture shared advisory order',admin,call(op),capture(4),None)
    h.check(f"(select count(*)=1 from leave_benefit_operation where from_source='{source}') and leave_source_balance('{source}')=0",'Evidence refresh duplicated transfer')
    v=h.sql(f"select version from leave_account where employee_id='{emp}' and year=2027 and bucket='ANNUAL';")
    undo=reverse(op,v,'SYNTHETIC exact carryover reversal')
    h.race('carryover reversal exact replay conserves both years',admin,undo,undo,None)
    h.check(f"leave_source_balance('{source}')=1 and (select leave_source_balance(to_source)=0 from leave_benefit_operation where id='{op}') and (select count(*)=1 from leave_benefit_reversal where operation_id='{op}')",'Carryover reversal conservation failed')
    h.check(f"(select valid_until=date '2026-12-31' from leave_source_validity where source_id='{source}')",'Reversal extended original validity')


if __name__=='__main__':
    main()
