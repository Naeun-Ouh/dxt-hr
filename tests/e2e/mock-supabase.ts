// Test-only external Auth/PostgREST double. There is no auth bypass in application code.
import { createServer } from "node:http";
import { cases, tokenFor, idFor } from "./fixtures";
import { domainDatabase, asUser } from '../domain-fixture';
async function main() {
const db = await domainDatabase();
const tables: Record<string,string[]> = {
 employee: ['id','name','english_name','company_email','phone','department_id','title','hire_date','employment_status','work_location','version'],
 employee_role: ['employee_id','role'],
 organization: ['id','name','parent_id','type','version'],
 employee_private_hr: ['employee_id','encrypted_payload','version'], employee_birth_detail: ['employee_id','birth_date_encrypted'],
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url!, "http://localhost:54329");
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
  if (!name) { response.writeHead(401); return response.end(JSON.stringify({ message: "Invalid token" })); }
  if (url.pathname === "/auth/v1/user") return response.end(JSON.stringify({ id: idFor(name), aud: "authenticated", email: `${name}@example.test`, app_metadata: {}, user_metadata: { roles: ["CEO"] } }));
  if (url.pathname === "/rest/v1/app_memberships") {
    if (url.searchParams.get("user_id") !== `eq.${idFor(name)}`) { response.writeHead(403); return response.end('{}'); }
    const fixture = cases[name];
    return response.end(JSON.stringify(name === "unprovisioned" ? [] : [{ display_name: "테스트 사용자", status: fixture.status || "ACTIVE", roles: fixture.roles, capabilities: fixture.capabilities || [] }]));
  }
  if (url.pathname === "/auth/v1/logout") { response.writeHead(204); return response.end(); }
  if (url.pathname.startsWith('/rest/v1/')) {
   try {
    let body=''; for await(const chunk of request) body+=chunk;
    const input=body?JSON.parse(body):{};
    const result=await asUser(db,name,async tx=>{
     const rpc=url.pathname.split('/rpc/')[1];
     if(rpc) {
      const args: Record<string,string[]>= {has_app_capability:['requested'],save_employee_profile:['p_id','p_profile','p_expected_version','p_birth_ciphertext','p_clear_birth','p_private_ciphertext'],save_private_hr:['p_employee_id','p_ciphertext','p_expected_version'],record_private_hr_view:['p_employee_id'],record_birth_view:['p_employee_id']};
      if(!args[rpc]) throw new Error('Unsupported test RPC');
      const params=args[rpc].map(key=>input[key] ?? null);
      const r=await tx.query<{result: unknown}>(`select public.${rpc}(${params.map((_,i)=>'$'+(i+1)).join(',')}) as result`,params);
      return {data:r.rows[0].result};
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
      return {data:r.rows.map(row => { const value = row as Record<string,unknown>; if(value.hire_date instanceof Date) value.hire_date=value.hire_date.toISOString().slice(0,10); return value; }),count:Number(count.rows[0].n)};
     }
     if(table!=='organization'||!['POST','PATCH'].includes(request.method!)) throw new Error('Unsupported test mutation');
     const keys=Object.keys(input);if(keys.some(k=>!allowed.includes(k))) throw new Error('Unsupported test mutation column');
     const sql=request.method==='POST'?`insert into organization(${keys.join(',')}) values(${keys.map(k=>bind(input[k])).join(',')})`:`update organization set ${keys.map(k=>k+'='+bind(input[k])).join(',')}${condition}`;
     return {data:(await tx.query(sql+` returning ${columns.join(',')}`,params)).rows};
    });
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
