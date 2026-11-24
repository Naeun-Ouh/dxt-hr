begin;
-- Fail closed on previously uploaded oversized rows: inspect and reconcile with
-- the authorized HR owner before retrying. Never truncate or delete original files.
alter table public.employee_hr_document drop constraint employee_hr_document_byte_size_check;
alter table public.employee_hr_document add constraint employee_hr_document_byte_size_check
 check(byte_size between 1 and 4194304);
update storage.buckets set file_size_limit=4194304 where id='employee-hr-documents';
commit;
