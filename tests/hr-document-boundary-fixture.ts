import {PDFDocument} from 'pdf-lib';
/** Valid synthetic PDF padded with permitted trailing whitespace; no personal data. */
export async function syntheticHrPdf(size:number){
 const pdf=await PDFDocument.create();pdf.addPage().drawText('SYNTHETIC TRANSPORT BOUNDARY — NO PERSONAL DATA'.replace('—','-'));
 const content=Buffer.from(await pdf.save());if(size<content.length)throw new Error('Size too small');
 const bytes=Buffer.alloc(size,32);content.copy(bytes);return bytes;
}
