import {leaveDatabase} from '../leave-fixture';
import {REQUEST_COLUMNS as LEAVE_REQUEST_COLUMNS,LEDGER_COLUMNS as LEAVE_LEDGER_COLUMNS,HISTORY_COLUMNS as LEAVE_HISTORY_COLUMNS} from '../../src/lib/leave/types';
import type { Transaction } from '@electric-sql/pglite';
import { asService,offboardingId,documentId,letter } from '../operations-fixture';
import { OPERATION_COLUMNS,TASK_COLUMNS,HISTORY_COLUMNS,ANNOUNCEMENT_COLUMNS,REGISTRATION_COLUMNS,POST_COLUMNS,TEMPLATE_COLUMNS,DOCUMENT_COLUMNS } from '../../src/lib/operations/types';
import { ASSET_COLUMNS,VAULT_COLUMNS,ASSIGNMENT_COLUMNS as ASSET_ASSIGNMENT_COLUMNS,EVENT_COLUMNS } from '../../src/lib/assets/types';
// Test-only external Auth/PostgREST double. There is no auth bypass in application code.
import { createServer } from "node:http";
import { cases, tokenFor, idFor } from "./fixtures";
import { asUser } from '../domain-fixture';
import { claimId, otherClaimId, receiptId, otherReceiptId } from '../expense-fixture';
import { CLAIM_COLUMNS, ITEM_COLUMNS, ATTACHMENT_COLUMNS, VEHICLE_COLUMNS } from '../../src/lib/expenses/types';
import { PROJECT_COLUMNS, ASSIGNMENT_COLUMNS, CAREER_COLUMNS, EXTENSION_COLUMNS } from '../../src/lib/projects/types';
async function main() {
const db = await leaveDatabase();
const files=new Map<string,Buffer>([[`${claimId}/${receiptId}`,Buffer.from('%PDF-1.4 own')],[`${otherClaimId}/${otherReceiptId}`,Buffer.from('%PDF-1.4 other')]]);
files.set(`${offboardingId}/${documentId}`,Buffer.from(letter));
const tables: Record<string,string[]> = {
 leave_request:LEAVE_REQUEST_COLUMNS.split(','),leave_ledger:LEAVE_LEDGER_COLUMNS.split(','),leave_history:LEAVE_HISTORY_COLUMNS.split(','),leave_account:['employee_id','year','bucket','version'],
 operation_case:OPERATION_COLUMNS.split(','),operation_task:TASK_COLUMNS.split(','),operation_task_owner:['task_id','employee_id'],operation_history:HISTORY_COLUMNS.split(','),resignation_private:['case_id','version'],resignation_document:DOCUMENT_COLUMNS.split(','),announcement:ANNOUNCEMENT_COLUMNS.split(','),family_registration:REGISTRATION_COLUMNS.split(','),family_post:POST_COLUMNS.split(','),birthday_template:TEMPLATE_COLUMNS.split(','),
 asset:ASSET_COLUMNS.split(','),vault_entry:VAULT_COLUMNS.split(','),asset_assignment:ASSET_ASSIGNMENT_COLUMNS.split(','),asset_event:EVENT_COLUMNS.split(','),
 expense_claim:CLAIM_COLUMNS.split(','),expense_item:ITEM_COLUMNS.split(','),expense_attachment:ATTACHMENT_COLUMNS.split(','),expense_attendee:['item_id','employee_id','allocated_amount'],vehicle_travel_detail:VEHICLE_COLUMNS.split(','),
 project: PROJECT_COLUMNS.split(','), project_assignment: ASSIGNMENT_COLUMNS.split(','), career: CAREER_COLUMNS.split(','), project_extension: EXTENSION_COLUMNS.split(','),
 employee: ['id','name','english_name','company_email','phone','department_id','title','hire_date','employment_status','work_location','version'],
 employee_role: ['employee_id','role'],
 organization: ['id','name','parent_id','type','version'],
 employee_private_hr: ['employee_id','encrypted_payload','version'], employee_birth_detail: ['employee_id','birth_date_encrypted'],
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url!, "http://localhost:54329");
  const service=request.headers.authorization==='Bearer test-operations-service';
  const name = Object.keys(cases).find(key => request.headers.authorization === `Bearer ${tokenFor(key)}`);
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/health") return response.end('{}');
  if (url.pathname === "/auth/v1/authorize") {
    const callback = new URL(url.searchParams.get("redirect_to")!);
    if (callback.origin !== "http://localhost:3100" || !url.searchParams.get("code_challenge")) { response.writeHead(400); return response.end('{}'); }
    callback.searchParams.set("code", "fixture-code");
    response.writeHead(302, { Location: callback.toString() }); return response.end();
  }
  if (url.pathname === "/auth/v1/token" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (input.auth_code !== "fixture-code" || !input.code_verifier) { response.writeHead(400); return response.end(JSON.stringify({ error: "invalid_grant" })); }
    return response.end(JSON.stringify({ access_token: tokenFor("employee"), refresh_token: "refresh-employee", token_type: "bearer", expires_in: 3600,
      user: { id: idFor("employee"), aud: "authenticated", email: "employee@example.test", app_metadata: {}, user_metadata: {} } }));
  }
  if (!name && !service) { response.writeHead(401); return response.end(JSON.stringify({ message: "Invalid token" })); }
  if (url.pathname === "/auth/v1/user") return response.end(JSON.stringify({ id: idFor(name!), aud: "authenticated", email: `${name}@example.test`, app_metadata: {}, user_metadata: { roles: ["CEO"] } }));
  if (url.pathname === "/rest/v1/app_memberships") {
    if (url.searchParams.get("user_id") !== `eq.${idFor(name!)}`) { response.writeHead(403); return response.end('{}'); }
    const fixture = cases[name!];
    return response.end(JSON.stringify(name === "unprovisioned" ? [] : [{ display_name: "테스트 사용자", status: fixture.status || "ACTIVE", roles: fixture.roles, capabilities: fixture.capabilities || [] }]));
  }
  if (url.pathname === "/auth/v1/logout") { response.writeHead(204); return response.end(); }
  if(url.pathname.startsWith('/storage/v1/object/')) {
   try {
    const match=/^\/storage\/v1\/object\/(?:authenticated\/)?(expense-evidence|resignation-letters)\/(.+)$/.exec(url.pathname);if(!match)throw new Error('Unknown bucket');const bucket=match[1],path=decodeURIComponent(match[2]);
    if(request.method==='POST') {
     const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));const body=Buffer.concat(chunks);
     await asUser(db,name!,tx=>tx.query("insert into storage.objects(bucket_id,name,metadata) values($3,$1,$2)",[path,JSON.stringify({size:body.length,mimetype:request.headers['content-type']}),bucket]));
     files.set(path,body);return response.end(JSON.stringify({Key:bucket+'/'+path}));
    }
    const rows=service?await db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query('select name from storage.objects where bucket_id=$1 and name=$2',[bucket,path]);}):await asUser(db,name!,tx=>tx.query('select name from storage.objects where bucket_id=$1 and name=$2',[bucket,path]));
    if(!rows.rows.length||!files.has(path))throw new Error('Denied');
    response.setHeader('Content-Type','application/pdf');return response.end(files.get(path));
   }catch{response.writeHead(403);return response.end(JSON.stringify({message:'Denied'}));}
  }
  if (url.pathname.startsWith('/rest/v1/')) {
   try {
    let body=''; for await(const chunk of request) body+=chunk;
    const input=body?JSON.parse(body):{};
    const execute=async(tx:Transaction)=>{
     const rpc=url.pathname.split('/rpc/')[1];
     if(rpc) {
      const args: Record<string,string[]>= {leave_today:[],leave_summary:['p_employee','p_year'],leave_calendar:['p_month'],leave_reviewer:['p_employee'],submit_leave:['p_id','p_start','p_end','p_unit','p_reason','p_past_reason'],review_leave:['p_items','p_action','p_note'],adjust_leave:['p_employee','p_year','p_delta','p_reason','p_version'],enqueue_company_mail:['p_family_only','p_birthdays'],claim_company_mail:['p_family_only'],finish_company_mail:['p_id','p_token','p_message_id','p_uncertain'],start_operation:['p_id','p_kind','p_employee','p_date'],save_operation_task:['p_id','p_status','p_memo','p_owners','p_version'],save_operation_case:['p_id','p_date','p_leave','p_complete','p_version'],save_resignation_reason:['p_id','p_ciphertext','p_version'],reveal_resignation_reason:['p_id'],reserve_resignation_document:['p_id','p_filename','p_mime','p_size'],finish_resignation_document:['p_id'],record_resignation_download:['p_id'],save_announcement:['p_id','p_title','p_body','p_publish','p_version'],save_family_registration:['p_id','p_category','p_date','p_title','p_details','p_version'],publish_family_post:['p_id','p_title','p_body','p_publish','p_version'],family_notification_status:['p_id'],save_birthday_template:['p_year','p_subject','p_body','p_version'],save_employee_with_birthday:['p_id','p_profile','p_expected_version','p_birth_ciphertext','p_clear_birth','p_private_ciphertext','p_month','p_day'],save_asset:['p_id','p_values','p_expected_version'],delete_asset:['p_id','p_expected_version'],save_vault_entry:['p_id','p_kind','p_values','p_ciphertext','p_expected_version'],reveal_vault_entry:['p_id','p_kind'],delete_vault_entry:['p_id','p_kind','p_expected_version'],expense_dining_available:['p_month','p_items'],ensure_expense_claim:['p_month'],reserve_expense_attachment:['p_claim','p_filename','p_mime','p_size'],finish_expense_attachment:['p_id'],save_expense_items:['p_claim','p_items','p_reason'],submit_expense_claim:['p_claim','p_version','p_reason'],manage_expense_claim:['p_claim','p_version','p_action'],can_read_career:['p_employee'],current_employee_id:[],save_project:['p_id','p_values','p_expected_version'],save_assignment:['p_id','p_values','p_expected_version'],save_career:['p_id','p_values','p_expected_version'],delete_project_record:['p_kind','p_id','p_expected_version'],has_app_capability:['requested'],save_employee_profile:['p_id','p_profile','p_expected_version','p_birth_ciphertext','p_clear_birth','p_private_ciphertext'],save_private_hr:['p_employee_id','p_ciphertext','p_expected_version'],record_private_hr_view:['p_employee_id'],record_birth_view:['p_employee_id']};
      if(!args[rpc]) throw new Error('Unsupported test RPC');
      const params=args[rpc].map(key=>key==='p_items'?JSON.stringify(input[key]):input[key] ?? null);
      const r=await tx.query<{result: unknown}>(`select public.${rpc}(${params.map((_,i)=>'$'+(i+1)).join(',')}) as result`,params);
      const value=r.rows[0].result;
      return {data:rpc==='leave_today' && value instanceof Date ? value.toISOString().slice(0,10) : value};
     }
     const table=url.pathname.split('/').at(-1)!; const allowed=tables[table];
     if(!allowed) throw new Error('Unsupported test table');
     const columns=(url.searchParams.get('select') || '*').split(',');
     const roleRelation = table === 'employee' && columns.includes('employee_role(role)');
     if(columns.some(c=>!allowed.includes(c) && !(roleRelation && c === 'employee_role(role)'))) throw new Error('Unsupported test column');
     const params: unknown[]=[]; const bind=(v:unknown)=>{params.push(v);return '$'+params.length;};
     const where: string[]=[];
     for(const [key,value] of url.searchParams) {
      if(allowed.includes(key)) { if(!value.startsWith('eq.')) throw new Error('Unsupported test filter'); where.push(`${key}=${bind(value.slice(3))}`); }
      if(key==='or') {
       const pieces=value.slice(1,-1).split(',').map(part=>{const match=/^(name|company_email)\.ilike\.\*(.*)\*$/.exec(part);if(!match)throw new Error('Unsupported test search');return `${match[1]} ilike ${bind('%'+match[2]+'%')}`;});
       where.push('('+pieces.join(' or ')+')');
      }
     }
     const condition=where.length?' where '+where.join(' and '):'';
     if(request.method==='GET') {
      const count=await tx.query<{n: number}>(`select count(*)::int as n from ${table}${condition}`,params);
      const order=(url.searchParams.get('order') || '').split(',').filter(Boolean).map(p=>{const [col,dir]=p.split('.');if(!allowed.includes(col)||!['asc','desc'].includes(dir)) throw new Error('Unsupported test order');return col+' '+dir;});
      const offset=Number(url.searchParams.get('offset') || 0),limit=Number(url.searchParams.get('limit') || 1000);
      const r=await tx.query(`select ${columns.map(c=>c === 'employee_role(role)' ? `(select coalesce(json_agg(json_build_object('role',er.role)),'[]'::json) from employee_role er where er.employee_id=employee.id) as employee_role` : c).join(',')} from ${table}${condition}${order.length?' order by '+order.join(','):''} limit ${bind(limit)} offset ${bind(offset)}`,params);
      return {data:r.rows.map(row => { const value = row as Record<string,unknown>; for(const [key,v] of Object.entries(value)) if(v instanceof Date) value[key]=(key.endsWith('_date')||key==='usage_month')?v.toISOString().slice(0,10):v.toISOString(); return value; }),count:Number(count.rows[0].n)};
     }
     if(table!=='organization'||!['POST','PATCH'].includes(request.method!)) throw new Error('Unsupported test mutation');
     const keys=Object.keys(input);if(keys.some(k=>!allowed.includes(k))) throw new Error('Unsupported test mutation column');
     const sql=request.method==='POST'?`insert into organization(${keys.join(',')}) values(${keys.map(k=>bind(input[k])).join(',')})`:`update organization set ${keys.map(k=>k+'='+bind(input[k])).join(',')}${condition}`;
     return {data:(await tx.query(sql+` returning ${columns.join(',')}`,params)).rows};
    };
    const result=service?await asService(db,execute):await asUser(db,name!,execute);
    if('count' in result) response.setHeader('Content-Range',`0-${Math.max(0,result.count!-1)}/${result.count}`);
    return response.end(JSON.stringify(result.data));
   } catch(error) {
    const code=error && typeof error==='object' && 'code' in error?String(error.code):'XX000';
    response.writeHead(400);return response.end(JSON.stringify({code,message:'Test database rejected request'}));
   }
  }
  response.writeHead(404); response.end('{}');
});
server.listen(54329, "localhost");

}
void main();
