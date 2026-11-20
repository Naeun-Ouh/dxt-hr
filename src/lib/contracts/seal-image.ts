import sharp from 'sharp';
import {createHash} from 'node:crypto';
export const SEAL_MAX_BYTES=1024*1024;
// Decode with strict bounds and re-encode: metadata, trailing payloads and animation
// never reach Storage or PDF. Only PNG is accepted; MIME/extension alone are not trusted.
export async function normalizeSeal(input:Buffer){
 if(!input.length||input.length>SEAL_MAX_BYTES||!input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG');
 // Reject APNG animation chunks rather than silently taking a frame.
 for(let offset=8;offset+12<=input.length;){
  const size=input.readUInt32BE(offset),kind=input.toString('ascii',offset+4,offset+8);
  if(kind==='acTL')throw new Error('Animated PNG not supported');
  if(size>input.length-offset-12)throw new Error('Invalid PNG chunk');
  offset+=size+12;
  if(kind==='IEND')break;
 }
 const image=sharp(input,{limitInputPixels:2048*2048,failOn:'warning'}),meta=await image.metadata();
 if(meta.format!=='png'||!meta.width||!meta.height||meta.width>2048||meta.height>2048||(meta.pages??1)!==1)throw new Error('Invalid PNG dimensions');
 const bytes=await image.png().toBuffer();
 if(bytes.length>2097152)throw new Error('PNG too large');
 return {bytes,hash:createHash('sha256').update(bytes).digest('hex')};
}
