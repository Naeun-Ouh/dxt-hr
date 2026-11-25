import { PDFDocument,rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import type { Contract,Signature } from './types';
import { seoulTime } from './types';
// Fontsource ships WOFF1. Convert its lossless table container to SFNT before
// embedding: PDF font streams require SFNT, not browser WOFF containers.
export function sfnt(woff:Buffer):Buffer {
 if(woff.readUInt32BE(0)!==0x774f4646)throw new Error('Invalid font container');
 const count=woff.readUInt16BE(12),out=Buffer.alloc(woff.readUInt32BE(16));
 out.writeUInt32BE(woff.readUInt32BE(4),0);out.writeUInt16BE(count,4);
 const power=2**Math.floor(Math.log2(count));out.writeUInt16BE(power*16,6);out.writeUInt16BE(Math.log2(power),8);out.writeUInt16BE(count*16-power*16,10);
 let offset=12+16*count,headOffset=0;
 for(let i=0;i<count;i++){const source=44+i*20,target=12+i*16,at=woff.readUInt32BE(source+4),size=woff.readUInt32BE(source+8),length=woff.readUInt32BE(source+12);const bytes=woff.subarray(at,at+size);const table=size===length?bytes:inflateSync(bytes);
 if(table.length!==length)throw new Error('Invalid font table');woff.copy(out,target,source,source+4);out.writeUInt32BE(woff.readUInt32BE(source+16),target+4);out.writeUInt32BE(offset,target+8);out.writeUInt32BE(length,target+12);if(woff.toString('ascii',source,source+4)==='head')headOffset=offset;table.copy(out,offset);offset+=(length+3)&~3;
 }
 if(headOffset){out.writeUInt32BE(0,headOffset+8);let sum=0;for(let i=0;i<out.length;i+=4)sum=(sum+out.readUInt32BE(i))>>>0;out.writeUInt32BE((0xb1b0afba-sum)>>>0,headOffset+8);}
 return out;
}
// A portable server renderer; no browser, remote fonts, HTML or executable template content.
export async function contractPdf(c:Contract,body:string,hash:string,signatures:Signature[],seal?:Buffer){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(sfnt(await readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff'))),{subset:false});
 pdf.setTitle('DXT 근로계약');pdf.setCreationDate(new Date(c.created_at));pdf.setModificationDate(new Date(c.company_signed_at||c.created_at));
 let page=pdf.addPage([595.28,841.89]),y=790;
 const line=(text:string,size=10)=>{if(y<65){page=pdf.addPage([595.28,841.89]);y=790;}page.drawText(text,{x:48,y,size,font,color:rgb(.12,.15,.2)});y-=size+8;};
 const wrap=(text:string,size=10,width=495)=>{for(const paragraph of text.replace(/\r/g,'').split('\n')){let row='';for(const char of paragraph){if(font.widthOfTextAtSize(row+char,size)>width){line(row,size);row='';}row+=char;}line(row,size);}};
 wrap('DXT 근로계약',20);wrap(`계약 ${c.id} / 버전 ${c.current_version}`,9);
 const s=c.employee_snapshot;wrap(`${s.name} / ${s.department||'미배정'} / ${s.title}`);wrap(`${s.email} / 입사일 ${s.hire_date}`);line('');
 wrap(body);line('');wrap('전자서명 확인 기록',14);
 for(const sign of signatures){
 if(sign.party==='COMPANY'){
  if(y<320){page=pdf.addPage([595.28,841.89]);y=790;}
  line('');wrap('회사 서명',14);
  const top=y;
  wrap(`회사명: ${sign.company_name ?? '이전 기록: 미기록'}`,11,355);
  wrap(`대표자: ${sign.representative_name ?? '이전 기록: 미기록'}`,11,355);
  if(sign.company_seal_id){
   if(!seal)throw new Error('Signed seal missing');
   const stamp=await pdf.embedPng(seal),scale=Math.min(84/stamp.width,84/stamp.height);
   page.drawImage(stamp,{x:445+(84-stamp.width*scale)/2,y:top-84,width:stamp.width*scale,height:stamp.height*scale});
  }else{page.drawText('직인 미사용',{x:445,y:top-36,size:9,font,color:rgb(.45,.48,.52)});}
  y=Math.min(y,top-104);
 }
 wrap(`${sign.party==='EMPLOYEE'?'직원':'회사'} 서명: ${seoulTime(sign.signed_at)} (Asia/Seoul)`);wrap(`인증 사용자: ${sign.actor_id}`,9);wrap(`인증 이메일: ${sign.authenticated_email ?? '이전 증적: 미기록'}`,9);wrap(`인증 제공자: ${sign.auth_provider ?? '이전 증적: 미기록'}`,9);wrap(`세션 식별자: ${sign.auth_session_id ?? '이전 증적: 미기록'}`,9);wrap(`동의 증빙: ${sign.evidence}`,9);}
 wrap(`계약본문 SHA-256: ${hash}`,8);wrap('본 PDF의 SHA-256은 계약 보관 기록에서 확인할 수 있습니다.',9);
 pdf.getPages().forEach((p,i)=>p.drawText(`${i+1} / ${pdf.getPageCount()}`,{x:280,y:30,size:9,font}));
 return Buffer.from(await pdf.save());
}
