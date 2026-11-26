import 'server-only';
import { expenseBatchPages } from './batch-pages';
import { notFound } from 'next/navigation';
import { currentEmployeeId, requireCapability } from '../auth/access';
import { employeeClient } from '../employees/data';
import { isUuid } from '../employees/validation';
import { can } from '../permissions';
import { CARD_COLUMNS, type PaymentCard, ATTACHMENT_COLUMNS, CLAIM_COLUMNS, ITEM_COLUMNS, VEHICLE_COLUMNS, type Attachment, type Attendee, type Claim, type Item, type Vehicle } from './types';
export async function expenseRows<T>(table:string,columns:string,filters:Record<string,string>={}) {
 const client=await employeeClient(),rows:T[]=[];
 for(let offset=0;;offset+=500){let request=client.from(table).select(columns).order(table==='expense_attendee'||table==='vehicle_travel_detail'?'item_id':'id').range(offset,offset+499);for(const [key,value]of Object.entries(filters))request=request.eq(key,value);const {data,error}=await request;if(error)throw new Error('Expense service unavailable');rows.push(...data as T[]);if(data.length<500)return rows;}
}
async function relatedRows<T>(table:string,columns:string,key:'item_id'|'claim_id',ids:string[]) {
 const client=await employeeClient();
 return expenseBatchPages<T>(ids,async(batch,from,to)=>{
  let query=client.from(table).select(columns).in(key,batch).order(key);
  // Stable composite order is essential when an attendee batch crosses a page boundary.
  query=query.order(table==='expense_attendee'?'employee_id':table==='vehicle_travel_detail'?'item_id':'id');
  const {data,error}=await query.range(from,to);
  if(error)throw new Error('Expense detail unavailable');return data as T[];
 });
}
async function children<T>(table:'expense_attendee'|'vehicle_travel_detail',columns:string,ids:string[]) {
 return relatedRows<T>(table,columns,'item_id',ids);
}
export async function expenseData(admin=false,scope:{month?:string;employee?:string;attachments?:boolean;vehicles?:boolean}={}) {
 const principal=await requireCapability(admin?'EXPENSE_MANAGE':'EMPLOYEE_ACCESS');
 const selfId=await currentEmployeeId(),filters:Record<string,string>={};
 if(scope.month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(scope.month))notFound();filters.usage_month=scope.month+'-01';}
 if(!admin){if(selfId)filters.employee_id=selfId;}
 else if(scope.employee){if(!isUuid(scope.employee))notFound();filters.employee_id=scope.employee;}
 const claims=admin||selfId?await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS,filters):[];
 const ids=claims.map(c=>c.id);
 const [items,attachments]=await Promise.all([
  relatedRows<Item>('expense_item',ITEM_COLUMNS,'claim_id',ids),
  scope.attachments===false?Promise.resolve([] as Attachment[]):relatedRows<Attachment>('expense_attachment',ATTACHMENT_COLUMNS,'claim_id',ids),
 ]);
 const [attendees,vehicles]=await Promise.all([
  children<Attendee>('expense_attendee','item_id,employee_id,allocated_amount',items.map(i=>i.id)),
  scope.vehicles?children<Vehicle>('vehicle_travel_detail',VEHICLE_COLUMNS,items.map(i=>i.id)):Promise.resolve([] as Vehicle[]),
 ]);
 const grouped=new Map<string,Attendee[]>();for(const a of attendees){if(!a.item_id)continue;const list=grouped.get(a.item_id)||[];list.push(a);grouped.set(a.item_id,list);}
 const vehicleMap=new Map(vehicles.map(v=>[v.item_id,v]));
 for(const item of items){item.attendees=grouped.get(item.id)||[];if(scope.vehicles)item.vehicle=vehicleMap.get(item.id);}
 return {principal,selfId,claims,items,attachments};
}
export async function expenseDetail(id:string,admin=false) {
 const principal=await requireCapability(admin?'EXPENSE_MANAGE':'EMPLOYEE_ACCESS');if(!isUuid(id))notFound();
 const selfId=await currentEmployeeId();
 const claims=await expenseRows<Claim>('expense_claim',CLAIM_COLUMNS,{id});const claim=claims[0];
 if(!claim||(!admin&&claim.employee_id!==selfId)||(admin&&!can(principal,'EXPENSE_MANAGE')))notFound();
 const [items,attachments]=await Promise.all([expenseRows<Item>('expense_item',ITEM_COLUMNS,{claim_id:id}),expenseRows<Attachment>('expense_attachment',ATTACHMENT_COLUMNS,{claim_id:id})]);
 const [attendees,vehicles]=await Promise.all([children<Attendee>('expense_attendee','item_id,employee_id,allocated_amount',items.map(i=>i.id)),children<Vehicle>('vehicle_travel_detail',VEHICLE_COLUMNS,items.map(i=>i.id))]);
 for(const item of items){item.attendees=attendees.filter(a=>a.item_id===item.id);item.vehicle=vehicles.find(v=>v.item_id===item.id);}
 return {claim,items,attachments};
}
export async function expenseOptions() {
 await requireCapability('EMPLOYEE_ACCESS');const client=await employeeClient();
 const [selfId,employees,accountResult]=await Promise.all([
  currentEmployeeId(),
  expenseRows<{id:string;name:string;company_email:string;employment_status:string}>('employee','id,name,company_email,employment_status'),
  client.from('expense_account_category').select('name,position').order('position'),
 ]);
 if(accountResult.error)throw new Error('Expense categories unavailable');
 const assignments=selfId?await expenseRows<{id:string;project_id:string}>('project_assignment','id,project_id',{employee_id:selfId}):[];
 const projects=await expenseBatchPages<{id:string;name:string}>(assignments.map(a=>a.project_id),async(ids,from,to)=>{
  const {data,error}=await client.from('project').select('id,name').in('id',ids).order('id').range(from,to);
  if(error)throw new Error('Expense projects unavailable');return data;
 });
 return {employees,projects,accounts:accountResult.data.map(a=>a.name as string),selfId};
}

export async function ownPaymentCards():Promise<PaymentCard[]> {
 await requireCapability('EMPLOYEE_ACCESS');
 const self=await currentEmployeeId();
 if(!self)throw new Error('직원 계정 연결이 필요합니다.');
 return expenseRows<PaymentCard>('expense_payment_card',CARD_COLUMNS,{employee_id:self});
}

export async function ownRoutePresets(){
 await requireCapability('EMPLOYEE_ACCESS');
 const self=await currentEmployeeId();
 if(!self)throw new Error('직원 계정 연결이 필요합니다.');
 return expenseRows<import('./routes').RoutePreset>('expense_route_preset','id,employee_id,origin,destination,alias,fuel_amount,toll_amount,active,version',{employee_id:self});
}
