import 'server-only';
import { notFound } from 'next/navigation';
import { requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { isUuid } from '../employees/validation';
import { can } from '../permissions';
import { ATTACHMENT_COLUMNS, CLAIM_COLUMNS, ITEM_COLUMNS, VEHICLE_COLUMNS, type Attachment, type Attendee, type Claim, type Item, type Vehicle } from './types';
export async function expenseRows<T>(table:string,columns:string,filters:Record<string,string>={}) {
 const client=await employeeClient(),rows:T[]=[];
 for(let offset=0;;offset+=500){let request=client.from(table).select(columns).order(table==='expense_attendee'||table==='vehicle_travel_detail'?'item_id':'id').range(offset,offset+499);for(const [key,value]of Object.entries(filters))request=request.eq(key,value);const {data,error}=await request;if(error)throw new Error('Expense service unavailable');rows.push(...data as T[]);if(data.length<500)return rows;}
}
export async function expenseData(admin=false) {
 const principal=await requireCapability(admin?'EXPENSE_MANAGE':'EMPLOYEE_ACCESS');
 const {data:selfId,error}=await (await employeeClient()).rpc('current_employee_id');if(error)throw new Error('Employee link unavailable');
 const claims=admin?await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS):selfId?await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS,{employee_id:selfId}):[];
 // Child records are fetched only for the already authorized claim set, including admin users' own screens.
 const children=await Promise.all(claims.map(async c=>({items:await expenseRows<Item>('expense_item',ITEM_COLUMNS,{claim_id:c.id}),attachments:await expenseRows<Attachment>('expense_attachment',ATTACHMENT_COLUMNS,{claim_id:c.id})})));
 const items=children.flatMap(c=>c.items);
 for(const item of items)item.attendees=await expenseRows<Attendee>('expense_attendee','item_id,employee_id,allocated_amount',{item_id:item.id});
 return {principal,selfId:selfId as string|null,claims,items,attachments:children.flatMap(c=>c.attachments)};
}
export async function expenseDetail(id:string,admin=false) {
 const principal=await requireCapability(admin?'EXPENSE_MANAGE':'EMPLOYEE_ACCESS');if(!isUuid(id))notFound();
 const client=await employeeClient();const {data:selfId}=await client.rpc('current_employee_id');
 const claims=await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS,{id});const claim=claims[0];
 if(!claim||(!admin&&claim.employee_id!==selfId)||(admin&&!can(principal,'EXPENSE_MANAGE')))notFound();
 const [items,attachments]=await Promise.all([expenseRows<Item>('expense_item',ITEM_COLUMNS,{claim_id:id}),expenseRows<Attachment>('expense_attachment',ATTACHMENT_COLUMNS,{claim_id:id})]);
 for(const item of items){item.attendees=await expenseRows<Attendee>('expense_attendee','item_id,employee_id,allocated_amount',{item_id:item.id});item.vehicle=(await expenseRows<Vehicle>('vehicle_travel_detail',VEHICLE_COLUMNS,{item_id:item.id}))[0];}
 return {claim,items,attachments};
}
export async function expenseOptions() {
 await requireCapability('EMPLOYEE_ACCESS');const client=await employeeClient();const {data:selfId}=await client.rpc('current_employee_id');
 const employees=await expenseRows<{id:string;name:string;company_email:string;employment_status:string}>('employee','id,name,company_email,employment_status');
 const assignments=selfId?await expenseRows<{id:string;project_id:string}>('project_assignment','id,project_id',{employee_id:selfId}):[];
 const projects=(await expenseRows<{id:string;name:string}>('project','id,name')).filter(p=>assignments.some(a=>a.project_id===p.id));
 return {employees,projects,selfId:selfId as string|null};
}
