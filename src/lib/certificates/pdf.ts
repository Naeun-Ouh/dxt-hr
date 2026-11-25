import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {sfnt} from '../contracts/pdf';
import type {Certificate} from './types';
export async function certificatePdf(c:Certificate,seal:Buffer){
 if(!c.snapshot||!c.reviewed_at||!c.seal_id)throw new Error('Approved snapshot required');
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(sfnt(await readFile(path.join(process.cwd(),'node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff'))),{subset:false});
 pdf.setTitle('DXT 재직증명서');pdf.setCreationDate(new Date(c.reviewed_at));pdf.setModificationDate(new Date(c.reviewed_at));
 let page=pdf.addPage([595.28,841.89]),y=760;
 const line=(text:string,size=11)=>{if(y<90){page=pdf.addPage([595.28,841.89]);y=760;}page.drawText(text,{x:65,y,size,font,color:rgb(.12,.15,.2)});y-=size+15;};
 const wrap=(value:string,size=11)=>{let row='';for(const char of value.replace(/[\r\n\t]/g,' ')){if(font.widthOfTextAtSize(row+char,size)>465){line(row,size);row='';}row+=char;}line(row,size);};
 wrap('재 직 증 명 서',25);line('');wrap(`발급번호 ${c.id}`,9);line('');
 const s=c.snapshot;
 for(const [label,value] of [['성명',s.name],['소속 / 부서',s.department||'미배정'],['직책',s.title],['입사일',s.hire_date],['재직 상태','재직 중'],['제출처 / 용도',c.purpose]])wrap(`${label}    ${value}`);
 line('');wrap('위 사람은 당사에 재직 중임을 증명합니다.');wrap(`발급 기준일    ${s.issue_date}`);line('');
 wrap(s.company_name,16);wrap(`대표자    ${s.representative_name}`);
 if(s.address)wrap(`주소    ${s.address}`);if(s.registration_number)wrap(`사업자등록번호    ${s.registration_number}`);
 if(y<190){page=pdf.addPage([595.28,841.89]);y=760;}
 const image=await pdf.embedPng(seal),scale=Math.min(88/image.width,88/image.height);
 page.drawImage(image,{x:430,y:y-90,width:image.width*scale,height:image.height*scale});y-=115;
 wrap('본 증명서는 승인 당시 인사정보와 회사 직인을 고정하여 발급되었습니다.',9);
 pdf.getPages().forEach((p,i)=>p.drawText(`${i+1} / ${pdf.getPageCount()}`,{x:280,y:35,size:9,font}));
 return Buffer.from(await pdf.save());
}
