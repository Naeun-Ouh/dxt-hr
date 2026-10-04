// Pure transport/worker core. Environment loading is confined to mail-server.ts.
import { timingSafeEqual } from 'node:crypto';
import { renderTemplate } from './validation';
export interface MailConfig{clientId:string;clientSecret:string;refreshToken:string;sender:string}
export interface MailClaim{id:string;token:string;kind:'BIRTHDAY'|'FAMILY_EVENT';email:string;name:string;subject:string;body:string;birthday?:string}
export interface MailStore{enqueue(familyId?:string):Promise<void>;claim(familyId?:string):Promise<MailClaim|null>;finish(claim:MailClaim,messageId:string|null,uncertain:boolean):Promise<void>}
const emailPattern=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
export function cronAuthorized(header:string|null,secret:string|undefined){if(!secret||secret.length<32||!header)return false;const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);return expected.length===actual.length&&timingSafeEqual(expected,actual);}
// Fold RFC 2047 encoded words without splitting a UTF-8 code point.
function encodedSubject(value:string){const chunks:string[]=[];let chunk='';for(const point of value){if(Buffer.byteLength(chunk+point)>39){chunks.push(chunk);chunk='';}chunk+=point;}if(chunk)chunks.push(chunk);return chunks.map(part=>'=?UTF-8?B?'+Buffer.from(part).toString('base64')+'?=').join('\r\n ');}
export function rawMessage(mail:MailClaim,sender:string){if(!emailPattern.test(sender)||!emailPattern.test(mail.email))throw new Error('Invalid mail address');const subject=mail.kind==='BIRTHDAY'?renderTemplate(mail.subject,mail.name,mail.birthday||''):mail.subject;const body=mail.kind==='BIRTHDAY'?renderTemplate(mail.body,mail.name,mail.birthday||''):mail.body;return Buffer.from([`From: ${sender}`,`To: ${mail.email}`,`Subject: ${encodedSubject(subject)}`,`Message-ID: <${mail.id}@dxt-hr.internal>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body).toString('base64').match(/.{1,76}/g)?.join('\r\n')||''].join('\r\n')).toString('base64url');}
export async function dispatchMail(store:MailStore,config:MailConfig|undefined,fetcher:typeof fetch=fetch,familyId?:string){
 await store.enqueue(familyId);
 if(!config||!emailPattern.test(config.sender))return {sent:0,uncertain:0,configured:false};
 // Refresh before claiming: credential/network failures here are safely retryable.
 const tokenResponse=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!tokenResponse.ok)throw new Error('Mail authorization unavailable');const token:unknown=await tokenResponse.json();
 if(!token||typeof token!=='object'||!('access_token' in token)||typeof token.access_token!=='string')throw new Error('Mail authorization unavailable');
 let sent=0,uncertain=0;const deadline=Date.now()+240000;
 while(Date.now()<deadline){
  const mail=await store.claim(familyId);if(!mail)return {sent,uncertain,configured:true};
  let messageId:string|null=null;
  try{
   // Exactly one send attempt for this durable claim. Never retry an ambiguous Gmail response.
   const response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({raw:rawMessage(mail,config.sender)}),cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Delivery uncertain');const result:unknown=await response.json();if(!result||typeof result!=='object'||!('id' in result)||typeof result.id!=='string'||!result.id||result.id.length>200)throw new Error('Delivery uncertain');messageId=result.id;
  }catch{uncertain++;}
  // If this write itself fails, SENDING remains terminal to automatic retries. Reconcile manually.
  await store.finish(mail,messageId,!messageId);if(messageId)sent++;
 }
 throw new Error('Mail queue needs continuation');
}
