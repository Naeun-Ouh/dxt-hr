import 'server-only';
import { operationsService } from './service';
import { dispatchMail,type MailClaim,type MailConfig,type MailStore } from './mail';
export async function runCompanyMail(familyId?:string){
 const client=operationsService();
 const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await client.rpc(name,args);if(error)throw new Error('Mail delivery state unavailable');return data;};
 const store:MailStore={enqueue:async id=>{await rpc('enqueue_company_mail',{p_family_only:id||null,p_birthdays:!id});},claim:async id=>await rpc('claim_company_mail',{p_family_only:id||null}) as MailClaim|null,finish:async(mail,id,uncertain)=>{await rpc('finish_company_mail',{p_id:mail.id,p_token:mail.token,p_message_id:id,p_uncertain:uncertain});}};
 const values=[process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,process.env.GMAIL_REFRESH_TOKEN,process.env.GMAIL_SENDER];
 const config:MailConfig|undefined=values.every(Boolean)?{clientId:values[0]!,clientSecret:values[1]!,refreshToken:values[2]!,sender:values[3]!}:undefined;
 return dispatchMail(store,config,fetch,familyId);
}
