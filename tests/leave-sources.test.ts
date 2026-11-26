import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {leaveDatabase,approvedLeaveId,leaveId,outsideLeaveId} from './leave-fixture';
import {asUser,personId} from './domain-fixture';
import {colleagueId} from './project-fixture';
const migration='supabase/migrations/20261125132957_leave_sources_and_birthday.sql';
async function database(){const db=await leaveDatabase();await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));await db.exec(readFileSync(migration,'utf8'));return db;}
type DB=Awaited<ReturnType<typeof database>>;
async function summary(db:DB,employee=personId,year=2026){return (await asUser(db,'admin',tx=>tx.query<{s:{version:number;balance:number}}>('select leave_summary($1,$2) s',[employee,year]))).rows[0].s;}
async function grant(db:DB,bucket:string,days:number,year=2026){const id=randomUUID(),version=(await summary(db,personId,year)).version;await asUser(db,'admin',tx=>tx.query('select grant_leave_source($1,$2,$3,$4,$5,$6,$7)',[id,personId,year,bucket,days,'Verified synthetic '+bucket,version]));return id;}
async function submit(db:DB,id:string,start:string,end=start,unit='FULL_DAY',kind='ANNUAL',exception=''){return asUser(db,'employee',tx=>tx.query('select submit_leave_benefit($1,$2,$3,$4,$5,$6,1,$7,$8)',[id,start,end,unit,'Synthetic request','Explained past date',kind,exception]));}
async function review(db:DB,id:string,action='APPROVED',version=1){return asUser(db,'leader',tx=>tx.query('select review_leave($1,$2,$3)',[JSON.stringify([{id,version}]),action,'Synthetic decision']));}

test('legacy monetary history is preserved; ordered split allocation and exact-source reversal survive year boundary',async()=>{
 const db=await leaveDatabase();try{
 const original=(await db.query('select id,employee_id,year,bucket,amount_delta,event_type,request_id,actor_id,note,occurred_at from leave_ledger order by id')).rows;
 await db.exec(readFileSync('supabase/migrations/20261124221310_leave_holiday_calendar.sql','utf8'));await db.exec(readFileSync(migration,'utf8'));
 assert.deepEqual((await db.query('select id,employee_id,year,bucket,amount_delta,event_type,request_id,actor_id,note,occurred_at from leave_ledger order by id')).rows,original);
 const substitute=await grant(db,'SUBSTITUTE',0.5),carry=await grant(db,'CARRYOVER',1,2025),id=randomUUID();
 await submit(db,id,'2026-10-26','2026-10-28');await review(db,id);
 const deductions=(await db.query<{id:string;source_id:string;bucket:string;amount_delta:string}>("select id,source_id,bucket,amount_delta from leave_ledger where request_id=$1 and event_type='DEDUCTION' order by bucket",[id])).rows;
 assert.deepEqual(deductions.map(r=>[r.bucket,r.amount_delta]),[['ANNUAL','-1.5'],['CARRYOVER','-1.0'],['SUBSTITUTE','-0.5']]);
 assert.equal(deductions.find(r=>r.bucket==='SUBSTITUTE')?.source_id,substitute);assert.equal(deductions.find(r=>r.bucket==='CARRYOVER')?.source_id,carry);
 await db.exec("create or replace function public.leave_today() returns date language sql stable as $$select date '2027-01-04'$$");
 await review(db,id,'CANCELLED',2);
 const reversals=(await db.query<{source_id:string;reversal_of:string;amount_delta:string}>("select source_id,reversal_of,amount_delta from leave_ledger where request_id=$1 and event_type='REVERSAL'",[id])).rows;
 for(const d of deductions){const r=reversals.find(r=>r.reversal_of===d.id);assert.equal(r?.source_id,d.source_id);assert.equal(Number(r?.amount_delta),-Number(d.amount_delta));}
 await assert.rejects(review(db,id,'CANCELLED',2),/STALE/);
 await review(db,approvedLeaveId,'CANCELLED',2); // historical pre-source request still reverses its original source
 await assert.rejects(db.query('update leave_ledger set note=$1 where id=$2',['rewrite',deductions[0].id]),/IMMUTABLE/);
 await assert.rejects(db.query('delete from leave_source where id=$1',[substitute]),/IMMUTABLE/);
 await grant(db,'ANNUAL',1);const split=randomUUID();await submit(db,split,'2026-11-02','2026-11-24');await review(db,split);
 assert.equal((await db.query("select id from leave_ledger where request_id=$1 and event_type='DEDUCTION' and bucket='ANNUAL'",[split])).rows.length,2);await review(db,split,'CANCELLED',2);
 const future=randomUUID();await assert.rejects(submit(db,future,'2027-01-04','2027-01-05'),/INSUFFICIENT/); // only carried 1 remains eligible: two days must fail
 }finally{await db.close();}
});

test('source writes are scoped, versioned, replay-safe and atomic with bulk allocation',async()=>{const db=await database();try{
 const id=randomUUID();const args=[id,personId,2026,'SUBSTITUTE',1,'Synthetic evidence',1];
 await asUser(db,'admin',tx=>tx.query('select grant_leave_source($1,$2,$3,$4,$5,$6,$7)',args));
 await asUser(db,'admin',tx=>tx.query('select grant_leave_source($1,$2,$3,$4,$5,$6,$7)',args));
 assert.equal((await db.query('select id from leave_ledger where source_id=$1',[id])).rows.length,1);
 await assert.rejects(asUser(db,'admin',tx=>tx.query('select grant_leave_source($1,$2,$3,$4,$5,$6,$7)',[...args.slice(0,4),2,...args.slice(5)])),/MISMATCH/);
 for(const role of ['employee','leader','expense','it','division'])await assert.rejects(asUser(db,role,tx=>tx.query('select grant_leave_source($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),...args.slice(1)])),/Denied/);
 await assert.rejects(asUser(db,'employee',tx=>tx.query('select leave_sources($1,2026)',[colleagueId])),/Denied/);
 assert.equal((await asUser(db,'employee',tx=>tx.query('select id from leave_source where employee_id=$1',[colleagueId]))).rows.length,0);
 for(const sql of ["select leave_available($1,date '2026-11-02',date '2026-11-02','ANNUAL')","select prepare_birthday_source($1,date '2026-11-02','AM_HALF','')","select submit_leave_kind($1,date '2026-11-02',date '2026-11-02','AM_HALF','','','BIRTHDAY','')",'select leave_source_balance($1)','select allocate_leave($1)','delete from leave_source where id=$1','update leave_ledger set note=\'forged\' where source_id=$1'])await assert.rejects(asUser(db,'employee',tx=>tx.query(sql,[id])),/permission denied/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');return tx.query('select leave_sources($1,2026)',[personId]);}),/permission denied/);
 for(const role of ['anon','authenticated'])for(const fn of ['leave_source_balance(uuid)','leave_available(uuid,date,date,text)','allocate_leave(uuid)','prepare_birthday_source(uuid,date,text,text)','submit_leave_kind(uuid,date,date,text,text,text,text,text)'])assert.equal((await db.query<{allowed:boolean}>('select has_function_privilege($1,$2,$3) allowed',[role,'public.'+fn,'EXECUTE'])).rows[0].allowed,false);
 const before=(await db.query('select count(*) n from leave_ledger')).rows;
 await assert.rejects(asUser(db,'leader',tx=>tx.query("select review_leave($1,'APPROVED','')",[JSON.stringify([{id:leaveId,version:1},{id:outsideLeaveId,version:1}])])),/Denied/);
 assert.deepEqual((await db.query('select count(*) n from leave_ledger')).rows,before);
 const version=(await summary(db)).version;
 const attempts=await Promise.allSettled([1,2].map(()=>asUser(db,'admin',tx=>tx.query("select correct_leave_source($1,0.5,'Correction',$2)",[id,version]))));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await db.query<{balance:string}>('select leave_source_balance($1) balance',[id])).rows[0].balance,'0.5');
 const first=randomUUID(),second=randomUUID();await submit(db,first,'2026-11-02','2026-11-13');await submit(db,second,'2026-11-16','2026-11-27');const approvals=await Promise.allSettled([review(db,first),review(db,second)]);assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);assert.equal((await summary(db)).balance,5.5);
 }finally{await db.close();}});

test('birthday half has own verified date, annual cap, exception evidence, exact reversal and conservative policy edges',async()=>{const db=await database();try{
 const id=randomUUID();await submit(db,id,'2026-01-02','2026-01-02','AM_HALF','BIRTHDAY');
 await assert.rejects(submit(db,randomUUID(),'2026-01-08','2026-01-08','PM_HALF','BIRTHDAY'),/ALREADY_USED/);
 await review(db,id);
 assert.equal((await summary(db)).balance,15);
 assert.deepEqual((await db.query("select bucket,amount_delta from leave_ledger where request_id=$1",[id])).rows,[{bucket:'BIRTHDAY',amount_delta:'-0.5'}]);
 await review(db,id,'CANCELLED',2);
 const plus=randomUUID();await submit(db,plus,'2026-01-09','2026-01-09','AM_HALF','BIRTHDAY');await review(db,plus,'REJECTED');
 await db.query('update birthday_calendar set month=1,day=16 where employee_id=$1',[personId]);const minus=randomUUID();await submit(db,minus,'2026-01-09','2026-01-09','AM_HALF','BIRTHDAY');await review(db,minus,'REJECTED');await db.query('update birthday_calendar set month=1,day=2 where employee_id=$1',[personId]);
 await assert.rejects(submit(db,randomUUID(),'2026-02-02','2026-02-02','AM_HALF','BIRTHDAY'),/EXCEPTION_REQUIRED/);
 const replacement=randomUUID();await submit(db,replacement,'2026-02-02','2026-02-02','PM_HALF','BIRTHDAY','Customer project prevented use');await review(db,replacement);
 assert.equal((await db.query("select id from leave_source where employee_id=$1 and bucket='BIRTHDAY'",[personId])).rows.length,1);
 assert.equal((await db.query<{exception_reason:string}>('select exception_reason from leave_request where id=$1',[replacement])).rows[0].exception_reason,'Customer project prevented use');
 await assert.rejects(submit(db,randomUUID(),'2026-12-30','2026-12-30','AM_HALF','BIRTHDAY','Project'),/POLICY_REVIEW/);
 await assert.rejects(submit(db,randomUUID(),'2027-01-04','2027-01-04','FULL_DAY','BIRTHDAY'),/HALF_REQUIRED/);
 const next=randomUUID(),competing=randomUUID();const concurrent=await Promise.allSettled([submit(db,next,'2027-01-04','2027-01-04','AM_HALF','BIRTHDAY'),submit(db,competing,'2027-01-05','2027-01-05','PM_HALF','BIRTHDAY')]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);await review(db,concurrent[0].status==='fulfilled'?next:competing);
 assert.equal((await db.query<{total:string}>("select sum(amount_delta) total from leave_ledger where employee_id=$1 and year=2027 and bucket='BIRTHDAY'",[personId])).rows[0].total,'0.0');
 await db.query('update birthday_calendar set month=2,day=29 where employee_id=$1',[personId]);
 await assert.rejects(submit(db,randomUUID(),'2027-03-01','2027-03-01','AM_HALF','BIRTHDAY','Project'),/NO_WORKDAY|POLICY_REVIEW/);
 await assert.rejects(submit(db,randomUUID(),'2027-03-02','2027-03-02','AM_HALF','BIRTHDAY','Project'),/POLICY_REVIEW/);
 await db.query('delete from birthday_calendar where employee_id=$1',[personId]);
 await assert.rejects(submit(db,randomUUID(),'2027-03-02','2027-03-02','AM_HALF','BIRTHDAY'),/UNVERIFIED/);
 await assert.rejects(asUser(db,'employee',tx=>tx.query('select * from birthday_calendar')),/permission denied/);
 }finally{await db.close();}});
