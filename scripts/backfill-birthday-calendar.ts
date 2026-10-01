// Explicit one-time migration. Never print DOB, encrypted values, credentials or email content.
import { createClient } from '@supabase/supabase-js';
import { decryptValue,parseKeyring } from '../src/lib/employees/encryption';
async function main(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('Server configuration required');
 const ring=parseKeyring(process.env.HR_ENCRYPTION_KEYS,process.env.HR_ENCRYPTION_ACTIVE_KEY),db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});let total=0;
 for(let offset=0;;offset+=500){const {data,error}=await db.from('employee_birth_detail').select('employee_id,birth_date_encrypted').order('employee_id').range(offset,offset+499);if(error)throw new Error('Backfill read failed');
 for(const row of data){const birth=decryptValue(row.birth_date_encrypted,`${row.employee_id}:birth`,ring);if(!/^\d{4}-\d{2}-\d{2}$/.test(birth))throw new Error('Invalid birth record');const {error}=await db.rpc('backfill_birthday_calendar',{p_id:row.employee_id,p_ciphertext:row.birth_date_encrypted,p_month:Number(birth.slice(5,7)),p_day:Number(birth.slice(8,10))});if(error)throw new Error('Backfill write failed; retry after checking concurrent edits');total++;}if(data.length<500)break;}
 console.info(`Birthday calendar backfilled: ${total} records.`);
}
main().catch(()=>{console.error('Birthday calendar backfill failed. Check server configuration and data privately.');process.exitCode=1;});
