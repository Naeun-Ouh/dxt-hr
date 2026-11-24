export const DOCUMENT_TYPES = {BANKBOOK_COPY:'통장사본',RESIDENT_REGISTRATION_COPY:'주민등록등본',RESUME:'이력서',OTHER_HR:'기타 인사서류'} as const;
export type DocumentType=keyof typeof DOCUMENT_TYPES;
export const DOCUMENT_COLUMNS='id,employee_id,document_type,filename,mime_type,byte_size,sha256,issued_date,expires_at,version,uploaded_at,archived_at';
export interface HrDocument {id:string;employee_id:string;document_type:DocumentType;filename:string;mime_type:string;byte_size:number;sha256:string;issued_date:string|null;expires_at:string|null;version:number;uploaded_at:string;archived_at:string|null}
