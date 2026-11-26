import {readFileSync} from 'node:fs';
import {leaveDatabase} from './leave-fixture';
import {confirmSyntheticLeaveValidity} from './leave-validity-fixture';
export const benefitMigration='supabase/migrations/20261126045159_leave_benefit_review_apply.sql';
export async function benefitDatabase(){const db=await leaveDatabase();for(const file of ['20261124221310_leave_holiday_calendar.sql','20261125132957_leave_sources_and_birthday.sql','20261125235641_leave_validity_review.sql','20261125133312_carryover_review.sql','20261125133519_weekend_work_evidence.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));await confirmSyntheticLeaveValidity(db);await db.exec(readFileSync(benefitMigration,'utf8'));return db;}
