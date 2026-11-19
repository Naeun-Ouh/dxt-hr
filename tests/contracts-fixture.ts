import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { leaveDatabase } from './leave-fixture';
import { asUser,personId,ring } from './domain-fixture';
import { colleagueId } from './project-fixture';
import { encryptValue } from '../src/lib/employees/encryption';
export const contractId='c0000000-0000-4000-8000-000000000001',otherContractId='c0000000-0000-4000-8000-000000000002';
export const contractBody='근로계약서\n제1조 업무 및 근무장소\n개발 업무를 수행합니다.\n제2조 보수\n연봉 50,000,000원 (테스트 데이터)\n당사자는 위 내용을 확인하고 동의합니다.';
export const contractHash=createHash('sha256').update(contractBody).digest('hex');
export function contractItem(id:string,employee_id=personId,version=1){return {id,employee_id,body:encryptValue(contractBody,`contract:${id}:${version}`,ring),hash:contractHash};}
export async function contractsDatabase(options:{legacyEvidence?:boolean}={}){const db=await leaveDatabase();
 await db.exec("create table auth.identities(user_id uuid references auth.users(id),provider text); insert into auth.identities select id,'google' from auth.users;");
 await db.exec("create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz); insert into auth.sessions select id,id,null from auth.users;");
 await db.exec(`create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{"amr":[{"method":"oauth"}],"app_metadata":{"provider":"google"}}'::jsonb || jsonb_build_object('session_id',auth.uid()))$$;`);
 await db.exec(readFileSync('supabase/migrations/20261118114126_employment_contracts.sql','utf8'));
 if(!options.legacyEvidence)await db.exec(readFileSync('supabase/migrations/20261119104141_contract_signature_evidence.sql','utf8'));
 await db.exec('grant insert on storage.objects to service_role');
 await asUser(db,'designated',tx=>tx.query('select create_employment_contracts($1,null)',[JSON.stringify([contractItem(contractId),contractItem(otherContractId,colleagueId)])]));
 for(const id of [contractId,otherContractId])for(const action of ['READY_TO_SEND','SENT'])await asUser(db,'designated',tx=>tx.query('select transition_employment_contract($1,1,$2)',[id,action]));
 return db;
}
