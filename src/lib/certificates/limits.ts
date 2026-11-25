// Leave headroom below the hosted 4.5 MB buffered-response limit.
export const CERTIFICATE_PDF_MAX_BYTES=4*1024*1024;
export class CertificatePdfSizeError extends Error {
 constructor(){super('생성된 증명서 PDF가 4 MiB를 초과했습니다. 직인 이미지 크기와 발급 정보를 확인한 뒤 발급 재시도를 이용해 주세요.');this.name='CertificatePdfSizeError';}
}
export function assertCertificatePdfSize(size:number){if(!Number.isSafeInteger(size)||size<=0||size>CERTIFICATE_PDF_MAX_BYTES)throw new CertificatePdfSizeError();}
