import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {MAX_DOCUMENT_BYTES,DOCUMENT_SIZE_MESSAGE} from './types';
export {MAX_DOCUMENT_BYTES} from './types';
export async function validateDocument(file:File){
 if(file.size>MAX_DOCUMENT_BYTES)throw new Error(DOCUMENT_SIZE_MESSAGE);
 if(!file.size||!file.name||file.name.length>200||/[\x00-\x1f\x7f/\\]/.test(file.name))throw new Error('파일명과 파일 내용을 확인해 주세요.');
 const bytes=Buffer.from(await file.arrayBuffer());
 const extension=file.name.split('.').pop()?.toLowerCase();
 if(file.type==='application/pdf'&&extension==='pdf'&&bytes.subarray(0,5).toString()==='%PDF-'){
  try{const pdf=await PDFDocument.load(bytes);if(pdf.getPageCount()<1)throw new Error();}catch{throw new Error('정상적인 PDF 파일을 선택해 주세요.');}
 }else if((file.type==='image/png'&&extension==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(file.type==='image/jpeg'&&['jpg','jpeg'].includes(extension||'')&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)){
  try{await sharp(bytes,{limitInputPixels:40000000,failOn:'warning'}).raw().toBuffer();}catch{throw new Error('정상적인 PNG / JPG 파일을 선택해 주세요.');}
 }else throw new Error('PDF / PNG / JPG 형식과 파일 내용이 일치해야 합니다.');
 return {bytes,hash:createHash('sha256').update(bytes).digest('hex')};
}
