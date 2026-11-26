import {asUser} from './domain-fixture';
import type {leaveDatabase} from './leave-fixture';
// SYNTHETIC TEST DATA ONLY. Never used as a production backfill or real entitlement evidence.
export async function confirmSyntheticLeaveValidity(db:Awaited<ReturnType<typeof leaveDatabase>>){
 const sources=(await db.query<{id:string;employee_id:string;year:number}>('select s.id,s.employee_id,s.year from leave_source s left join leave_source_validity v on v.source_id=s.id where v.source_id is null')).rows;
 for(const s of sources){const version=(await db.query<{version:number}>("select version from leave_account where employee_id=$1 and year=$2 and bucket='ANNUAL'",[s.employee_id,s.year])).rows[0].version;
 await asUser(db,'admin',tx=>tx.query('select confirm_leave_validity($1,$2,$3,$4,$5,$6)',[s.id,s.year,`${s.year}-01-01`,`${s.year}-12-31`,'Verified synthetic fixture validity; not production entitlement',version]));}
}
