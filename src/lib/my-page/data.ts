import 'server-only';
import {requireCapability} from '../auth/access';
import {employeeClient,getEmployee,organizations} from '../employees/data';
import type {Source} from '../leave/types';

// No employee identifier is accepted by this entry point, including for managers.
export async function myPageData(){
 await requireCapability('EMPLOYEE_ACCESS','/me');
 const db=await employeeClient(),identity=await db.rpc('current_employee_id');
 if(identity.error)throw new Error('내 정보를 불러오지 못했습니다.');
 const id=identity.data as string|null;if(!id)return null;
 const date=await db.rpc('leave_today');if(date.error||typeof date.data!=='string')throw new Error('내 정보를 불러오지 못했습니다.');
 const today=date.data,year=Number(today.slice(0,4));
 const count=async(query:PromiseLike<{count:number|null;error:unknown}>)=>{const r=await query;if(r.error||r.count===null)throw new Error('Summary unavailable');return r.count;};
 const [profile,departments,leave,projects,signatures,pendingCertificates,issuedCertificates]=await Promise.allSettled([
  getEmployee(id),organizations(),
  (async()=>{const r=await db.rpc('leave_sources',{p_employee:id,p_year:year});if(r.error)throw new Error('Leave unavailable');const sources=r.data as Source[];return {usable:sources.filter(s=>s.bucket!=='BIRTHDAY').reduce((n,s)=>n+Number(s.usable_balance),0),unverified:sources.some(s=>s.bucket!=='BIRTHDAY'&&!s.validity_confirmed&&Number(s.balance)>0)};})(),
  count(db.from('project_assignment').select('id',{count:'exact'}).eq('employee_id',id).eq('status','ACTIVE').lte('start_date',today).gte('end_date',today).limit(1)),
  count(db.from('employment_contract').select('id',{count:'exact'}).eq('employee_id',id).in('status',['SENT','VIEWED']).limit(1)),
  count(db.from('hr_certificate').select('id',{count:'exact'}).eq('employee_id',id).in('status',['REQUESTED','APPROVED']).limit(1)),
  count(db.from('hr_certificate').select('id',{count:'exact'}).eq('employee_id',id).eq('status','ISSUED').limit(1)),
 ]);
 if(profile.status==='rejected')throw new Error('내 정보를 불러오지 못했습니다.');
 return {profile:profile.value,department:departments.status==='fulfilled'?departments.value.find(d=>d.id===profile.value.department_id)?.name||'미배정':'확인할 수 없음',today,leave,projects,signatures,pendingCertificates,issuedCertificates};
}
