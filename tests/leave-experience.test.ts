import {test} from 'node:test';import assert from 'node:assert/strict';
import {balanceExperience,requestExperience,annualGrantEvidence} from '../src/lib/leave/experience';
import type {Source,LeaveRequest,Ledger} from '../src/lib/leave/types';
const source=(bucket:Source['bucket'],balance:number,extra:Partial<Source>={}):Source=>({id:bucket,year:2026,bucket,balance,usable_balance:balance,validity_confirmed:true,valid_from:'2026-01-01',valid_until:'2026-12-31',receiving_year:2026,note:'synthetic',version:1,...extra});
test('balances separate pending birthday, unknown and unconfirmed entitlements',()=>{
 const sources=[source('ANNUAL',5),source('CARRYOVER',2,{validity_confirmed:false,valid_from:null,valid_until:null})];
 const rows=[{status:'PENDING',kind:'ANNUAL',days:2},{status:'PENDING',kind:'BIRTHDAY',days:0.5},{status:'REJECTED',kind:'ANNUAL',days:99}] as LeaveRequest[];
 const view=balanceExperience(sources,rows,'2026-11-26');assert.equal(view.available,5);assert.equal(view.estimated,3);assert.equal(view.unknown,2);assert.equal(view.birthdayPending,0.5);assert.equal(view.expiring,5);assert.equal(view.buckets.CARRYOVER.known,false);assert.equal(view.buckets.SUBSTITUTE.known,false);
});
test('date preview excludes weekends and holiday and preserves allocation order without mutations',()=>{
 const sources=[source('ANNUAL',5),source('CARRYOVER',1),source('SUBSTITUTE',0.5)];const before=JSON.stringify(sources);
 const view=requestExperience('2026-12-24','2026-12-28','FULL_DAY',sources,['2026-12-25']);assert.equal(view.days,2);assert.equal(view.weekends.length,2);assert.deepEqual(view.excluded,['2026-12-25']);assert.deepEqual(view.allocation.map(a=>a.taken),[0.5,1,0.5]);assert.equal(JSON.stringify(sources),before);
});
test('cross-year dates remain visible for splitting; validity boundary never silently allocates',()=>{
 const sources=[source('ANNUAL',5)];const cross=requestExperience('2026-12-31','2027-01-04','FULL_DAY',sources,['2027-01-01']);assert.equal(cross.crossYear,true);assert.deepEqual(cross.workDates,['2026-12-31','2027-01-04']);assert.equal(cross.days,0);
 assert.equal(requestExperience('2026-12-30','2026-12-31','FULL_DAY',[source('ANNUAL',5,{valid_until:'2026-12-30'})],[]).split,true);
 assert.equal(requestExperience('2026-12-30','2026-12-30','AM_HALF',sources,[]).days,0.5);
 assert.equal(requestExperience('','2026-12-31','FULL_DAY',sources,[]).workDates.length,0);
});

test('grant evidence separates positive and negative adjustments from usage and legacy opening balances',()=>{
 const rows=[{year:2026,bucket:'ANNUAL',source_id:'new',event_type:'ADJUSTMENT',amount_delta:15},{year:2026,bucket:'ANNUAL',source_id:'new',event_type:'ADJUSTMENT',amount_delta:-2},{year:2026,bucket:'ANNUAL',source_id:'new',event_type:'DEDUCTION',amount_delta:-3},{year:2026,bucket:'ANNUAL',source_id:'old',event_type:'ADJUSTMENT',amount_delta:99},{year:2026,bucket:'SUBSTITUTE',source_id:'new',event_type:'ADJUSTMENT',amount_delta:5}] as Ledger[];
 const result=annualGrantEvidence(rows,[{id:'new',legacy:false},{id:'old',legacy:true}],2026);assert.equal(result.positive,15);assert.equal(result.negative,2);assert.equal(result.used,3);assert.equal(result.legacyUnverified,true);
 assert.equal(annualGrantEvidence([],[],2026).hasEvidence,false);assert.equal(annualGrantEvidence([],[{id:'old',legacy:true}],2026).legacyUnverified,true);
});
