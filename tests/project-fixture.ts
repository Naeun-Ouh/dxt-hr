import { readFileSync } from 'node:fs';
import { domainDatabase, departmentId, personId } from './domain-fixture';
import { idFor } from './e2e/fixtures';
export const projectId='30000000-0000-4000-8000-000000000001';
export const secondProjectId='30000000-0000-4000-8000-000000000002';
export const assignmentId='40000000-0000-4000-8000-000000000001';
export const otherAssignmentId='40000000-0000-4000-8000-000000000002';
export const colleagueId='10000000-0000-4000-8000-000000000002';
export const outsideId='10000000-0000-4000-8000-000000000003';
export const leaderId='10000000-0000-4000-8000-000000000004';
export const careerId='50000000-0000-4000-8000-000000000001';
export const projectValues={customer_name:'SK hynix',name:'LIMS 고도화',start_date:'2026-01-01',current_end_date:'2026-12-31',pm_employee_id:personId,work_location:'이천 / 원격',status:'ACTIVE'};
export const assignmentValues={project_id:projectId,employee_id:personId,start_date:'2026-01-01',end_date:'2026-06-30',role:'Business Analyst',status:'ACTIVE'};
export const careerValues={assignment_id:assignmentId,job_function:'IT Consultant',role:'Business Analyst',responsibilities:'실험 데이터 구조 설계와 사용자 요구사항 분석',skills:['LIMS','Data Governance']};
export async function projectDatabase() {
 const db=await domainDatabase();
 await db.exec(readFileSync('supabase/migrations/202609300004_projects.sql','utf8'));
 await db.query('update employee set auth_user_id=$1 where id=$2',[idFor('employee'),personId]);
 await db.transaction(async tx=>{
  for(const [id,name,auth,dept] of [[colleagueId,'이동료','expense',departmentId],[outsideId,'박외부팀','it',null],[leaderId,'최팀장','leader',departmentId]]) {
   await tx.query("insert into employee(id,name,company_email,title,hire_date,auth_user_id,department_id) values($1,$2,$3,'컨설턴트','2025-01-01',$4,$5)",[id,name,`${auth}@example.test`,idFor(auth!),dept]);
   await tx.query("insert into employee_role(employee_id,role) values($1,'EMPLOYEE')",[id]);
  }
 });
 await db.query("insert into project(id,customer_name,name,start_date,current_end_date,pm_employee_id,work_location,status) values($1,$2,$3,$4,$5,$6,$7,$8)",[projectId,...Object.values(projectValues)]);
 await db.query("insert into project(id,customer_name,name,start_date,current_end_date,pm_employee_id,work_location,status) values($1,'다른 고객사','데이터 플랫폼','2026-04-01','2026-12-31',$2,'서울','ACTIVE')",[secondProjectId,personId]);
 await db.query("insert into project_assignment(id,project_id,employee_id,start_date,end_date,role,status) values($1,$2,$3,'2026-01-01','2026-06-30','Business Analyst','COMPLETED'),($4,$2,$5,'2026-02-01','2026-12-31','팀 동료 역할','ACTIVE'),('40000000-0000-4000-8000-000000000003',$6,$7,'2026-04-01','2026-12-31','외부팀 비공개 역할','ACTIVE'),('40000000-0000-4000-8000-000000000004',$6,$3,'2026-04-01','2026-12-31','Data Engineer','ACTIVE')",[assignmentId,projectId,personId,otherAssignmentId,colleagueId,secondProjectId,outsideId]);
 await db.query('insert into career(id,employee_id,assignment_id,job_function,role,responsibilities,skills) values($1,$2,$3,$4,$5,$6,$7)',[careerId,personId,...Object.values(careerValues)]);
 return db;
}
