import test from 'node:test';
import assert from 'node:assert/strict';
import {can,ROLES,type Principal,type Role} from '../src/lib/permissions';
import {resolveRoute} from '../src/lib/routes';
import {workspacesFor,workspaceFor,modeFor} from '../src/lib/workspaces';
const person=(...roles:Role[]):Principal=>({id:'test',name:'테스트',roles,grants:[]});
const employeeLabels=['홈(마이페이지)','조직 / 직원','휴가','경비','나의 프로젝트','증명서 발급','계약','자산'];
test('all additive role combinations keep own navigation and filter every management child',()=>{
 for(let mask=1;mask<2**ROLES.length;mask++){
  const p=person(...ROLES.filter((_,i)=>mask&(1<<i)));
  assert.deepEqual(workspacesFor(p,'employee').map(w=>w.label),employeeLabels);
  for(const mode of ['employee','admin'] as const)for(const w of workspacesFor(p,mode)){
   assert(w.links.length);for(const l of w.links){assert(can(p,resolveRoute(l.href.split('?')[0])!.capability));if(l.capability)assert(can(p,l.capability));}
  }
 }
 assert.deepEqual(workspacesFor(person('CEO'),'admin').map(w=>w.label),['직원관리','조직관리','휴가관리','경비관리','프로젝트관리','증명서 발급 관리','계약관리','자산관리','환경설정']);
});
test('specialists only see their scoped workspaces, never global HR or secrets by navigation hints',()=>{
 assert.deepEqual(workspacesFor(person('TEAM_LEADER'),'admin').map(w=>w.id),['leave-admin','project-admin']);
 assert.deepEqual(workspacesFor(person('TEAM_LEADER'),'admin').flatMap(w=>w.links.map(l=>l.href)),['/leave/approvals','/leave/weekend-work/approvals','/projects/team']);
 assert.deepEqual(workspacesFor(person('EXPENSE_ADMIN'),'admin').map(w=>w.id),['expense-admin']);
 assert.deepEqual(workspacesFor(person('IT_ADMIN'),'admin').map(w=>w.id),['asset-admin']);
 for(const role of ['EMPLOYEE','DIVISION_HEAD'] as const){assert.equal(workspacesFor(person(role),'admin').length,0);assert.equal(modeFor(person(role),'/people','admin'),'employee');}
 assert(!workspacesFor(person('ADMIN'),'admin').flatMap(w=>w.links).some(l=>l.href==='/admin/migration-review'));
 assert(workspacesFor({...person('ADMIN'),grants:['PRIVATE_HR_ACCESS']},'admin').flatMap(w=>w.links).some(l=>l.href==='/admin/migration-review'));
});
test('existing details and team routes activate the correct workspace without revoking self access',()=>{
 const p=person('CEO');
 for(const [path,mode,id] of [['/me','employee','home'],['/people/employee-id','employee','people'],['/expenses/items/item/edit','employee','expenses'],['/projects/assignments/id','employee','projects'],['/career/new','employee','projects'],['/admin/contracts/seals','admin','contract-admin'],['/admin/lifecycle/id','admin','employees'],['/leave/weekend-work/approvals','admin','leave-admin']] as const)assert.equal(workspaceFor(p,mode,path)?.id,id);
 assert.equal(modeFor(p,'/assets/me',null),'employee');
 assert.equal(modeFor(p,'/organization','admin'),'admin');
 assert.equal(modeFor(person('TEAM_LEADER'),'/leave/approvals',null),'admin');
});
