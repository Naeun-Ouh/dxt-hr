import {can,type Capability,type Principal} from './permissions';
import {resolveRoute} from './routes';
export type WorkspaceMode='employee'|'admin';
export interface WorkspaceLink{href:string;label:string;capability?:Capability}
export interface Workspace{id:string;label:string;icon:string;links:WorkspaceLink[];prefixes?:string[]}
const link=(href:string,label:string,capability?:Capability):WorkspaceLink=>({href,label,capability});
const employee:Workspace[]=[
 {id:'home',label:'홈(마이페이지)',icon:'CircleX',links:[link('/','마이페이지'),link('/announcements','공지사항'),link('/family-events','경조사')],prefixes:['/me','/announcements','/family-events']},
 {id:'people',label:'조직 / 직원',icon:'Users2',links:[link('/people','직원 찾기'),link('/organization','조직도')]},
 {id:'leave',label:'휴가',icon:'CalendarCheck',links:[link('/leave','휴가 현황'),link('/leave/request','휴가 신청'),link('/leave/requests','신청 내역'),link('/leave/team-calendar','팀 캘린더'),link('/leave/weekend-work','주말근무'),link('/leave/carryover','이월 검토')]},
 {id:'expenses',label:'경비',icon:'CreditCard',links:[link('/expenses','월별 경비'),link('/expenses/upload','Excel 가져오기'),link('/expenses/new','개별 등록')]},
 {id:'projects',label:'나의 프로젝트',icon:'FolderLock',links:[link('/projects/me','내 프로젝트'),link('/career','커리어')],prefixes:['/projects/assignments']},
 {id:'certificates',label:'증명서 발급',icon:'FolderLock',links:[link('/certificates/me','신청 / 발급 내역')]},
 {id:'contracts',label:'계약',icon:'FolderLock',links:[link('/contracts/me','내 계약')]},
 {id:'assets',label:'자산',icon:'Laptop',links:[link('/assets/me','내 장비 / 인계 / 이력')]},
];
const admin:Workspace[]=[
 {id:'employees',label:'직원관리',icon:'UserCog',links:[link('/admin/employees','직원 현황'),link('/admin/lifecycle','입퇴사 업무'),link('/admin/onboarding','온보딩'),link('/admin/offboarding','퇴사 관리')]},
 {id:'organization',label:'조직관리',icon:'ChartNetwork',links:[link('/organization?workspace=admin','조직 관리','EMPLOYEE_MANAGE')]},
 {id:'leave-admin',label:'휴가관리',icon:'CalendarCog',links:[link('/admin/leave','직원별 원장'),link('/admin/leave/simulation','연차 산정 검토'),link('/admin/leave/benefits','대휴 / 이월 지급'),link('/leave/approvals','팀 휴가 승인'),link('/leave/weekend-work/approvals','주말근무 검토'),link('/admin/leave/carryover','이월 검토'),link('/admin/holidays','휴일 관리')]},
 {id:'expense-admin',label:'경비관리',icon:'CreditCard',links:[link('/admin/expenses','월별 경비 관리')]},
 {id:'project-admin',label:'프로젝트관리',icon:'FolderCog',links:[link('/admin/projects','프로젝트 관리'),link('/admin/resources','인력 투입'),link('/projects/team','팀 프로젝트')]},
 {id:'certificate-admin',label:'증명서 발급 관리',icon:'FolderLock',links:[link('/admin/certificates','발급 / 회사 정보')]},
 {id:'contract-admin',label:'계약관리',icon:'FolderLock',links:[link('/admin/contracts','계약 / 서식'),link('/admin/contracts/seals','회사 직인')]},
 {id:'asset-admin',label:'자산관리',icon:'Laptop',links:[link('/admin/assets','장비'),link('/admin/windows-licenses','Windows 라이선스'),link('/admin/accounts','계정')]},
 {id:'settings',label:'환경설정',icon:'Settings',links:[link('/admin/settings/birthday-email','생일 메일 설정'),link('/announcements?workspace=admin','공지 관리','ANNOUNCEMENT_MANAGE'),link('/family-events/review','경조사 접수'),link('/admin/certificates?workspace=admin','회사 정보'),link('/admin/migration-review','데이터 이관 검토')]},
];
export function workspacesFor(principal:Principal,mode:WorkspaceMode){return (mode==='admin'?admin:employee).map(w=>({...w,links:w.links.filter(l=>{const r=resolveRoute(l.href.split('?')[0]);return r&&can(principal,r.capability)&&(!l.capability||can(principal,l.capability));})})).filter(w=>w.links.length);}
export function workspaceFor(principal:Principal,mode:WorkspaceMode,path:string){const list=workspacesFor(principal,mode);const candidates=list.flatMap(w=>[...w.links.map(l=>l.href.split('?')[0]),...(w.prefixes||[])].filter(p=>path===p||(p!=='/'&&path.startsWith(p+'/'))).map(p=>({w,length:p.length})));return candidates.sort((a,b)=>b.length-a.length)[0]?.w;}
export function modeFor(principal:Principal,path:string,requested:string|null):WorkspaceMode{if(!workspacesFor(principal,'admin').length)return 'employee';if(requested==='admin'||path.startsWith('/admin/')||['/leave/approvals','/leave/weekend-work/approvals','/projects/team','/family-events/review'].some(p=>path===p||path.startsWith(p+'/')))return 'admin';return 'employee';}
