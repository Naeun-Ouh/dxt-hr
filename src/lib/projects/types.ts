export const STATUSES = { PLANNED: "예정", ACTIVE: "진행 중", COMPLETED: "종료" } as const;
export type Status = keyof typeof STATUSES;
export interface Project { id: string; customer_name: string; name: string; start_date: string; current_end_date: string; pm_employee_id: string; work_location: string; status: Status; version: number }
export interface Assignment { id: string; project_id: string; employee_id: string; start_date: string; end_date: string; role: string; status: Status; version: number }
export interface Extension { id: string; project_id: string; previous_end_date: string; new_end_date: string; reason: string | null; changed_at: string; changed_by: string | null; changed_by_name: string }
export interface Career { id: string; employee_id: string; assignment_id: string; job_function: string; role: string; responsibilities: string; skills: string[]; version: number }
export const PROJECT_COLUMNS = 'id,customer_name,name,start_date,current_end_date,pm_employee_id,work_location,status,version';
export const ASSIGNMENT_COLUMNS = 'id,project_id,employee_id,start_date,end_date,role,status,version';
export const CAREER_COLUMNS = 'id,employee_id,assignment_id,job_function,role,responsibilities,skills,version';
export const EXTENSION_COLUMNS = 'id,project_id,previous_end_date,new_end_date,reason,changed_at,changed_by,changed_by_name';
export function isCurrent(a: Assignment, today: string) { return a.status === 'ACTIVE' && a.start_date <= today && a.end_date >= today; }
export function todayInSeoul() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date()); }
