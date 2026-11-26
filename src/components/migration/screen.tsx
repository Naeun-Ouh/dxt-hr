import { requireCapability } from '@/lib/auth/access';
import { readRows } from '@/lib/operations/data';
import { MigrationReview } from './workspace';
export async function MigrationReviewScreen(){
 await requireCapability('PRIVATE_HR_ACCESS');
 const people=await readRows<{id:string;name:string;company_email:string}>('employee','id,name,company_email');
 return <MigrationReview people={people}/>;
}
