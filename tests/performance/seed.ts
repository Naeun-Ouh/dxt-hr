import type {PGlite} from '@electric-sql/pglite';
import {asUser,personId} from '../domain-fixture';
export const approvalId=(i:number)=>`bf000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
export async function seedPerformance(db:PGlite){
 if(process.env.DXT_PERF_HARNESS!=='1')return;
 // Fixed synthetic date makes October editable consistently on later benchmark runs.
 await db.exec("create or replace function public.expense_today() returns date language sql stable as $$select date '2026-11-26'$$");
 const id=(prefix:string,n:number)=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
 for(let i=0;i<50;i++){
  const employee=i===0?personId:id('1f000000',i);
  if(i)await db.transaction(async tx=>{await tx.query("insert into employee(id,name,company_email,hire_date,department_id,title,employment_status,work_location) values($1,$2,$3,'2025-01-02','20000000-0000-4000-8000-000000000001','연구원','ACTIVE','서울')",[employee,`성능검증 ${String(i).padStart(2,'0')}`,`performance-${i}@example.test`]);await tx.query("insert into employee_role(employee_id,role) values($1,'EMPLOYEE')",[employee]);});
  for(const month of ['2026-01-01','2026-02-01','2026-03-01','2026-10-01']){
   const c=await db.query<{id:string}>("insert into expense_claim(id,employee_id,usage_month) values($1,$2,$3) on conflict(employee_id,usage_month) do update set employee_id=excluded.employee_id returning id",[id('6f000000',i*10+Number(month.slice(5,7))),employee,month]);
   await db.query("insert into expense_item(id,claim_id,usage_date,expense_type,merchant,description,account_category,amount,evidence_type,payment_method) values(gen_random_uuid(),$1,$2,'OVERTIME','성능 합성 사용처','합성 식비','복리후생비',12000,'개인카드','PERSONAL_CARD')",[c.rows[0].id,month]);
  }
 }
 const version=await db.query<{version:number}>('select version from holiday_year where year=2026');
 const dates=['02','03','04','05','06','09','10','11','12','13','16'];
 for(let i=0;i<dates.length;i++)await asUser(db,'employee',tx=>tx.query("select submit_leave_benefit_v2($1,$2,$2,'AM_HALF','성능 합성 승인','',$3::integer,'ANNUAL','',null)",[approvalId(i),`2026-11-${dates[i]}`,version.rows[0].version]));
}
