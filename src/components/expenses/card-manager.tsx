'use client';
import {useState} from 'react';
import {Drawer} from '@/components/ui/workspace';
import {savePaymentCard} from '@/app/actions/expenses';
import {cardLabel} from '@/lib/expenses/cards';
import type {PaymentCard} from '@/lib/expenses/types';
export function CardManager({cards,onChange}:{cards:PaymentCard[];onChange:(cards:PaymentCard[])=>void}){
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<PaymentCard|null|undefined>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <><button className="button" onClick={()=>setOpen(true)}>카드 관리</button><Drawer open={open} onClose={()=>{if(!busy){setOpen(false);setEditing(undefined);setError('');}}} title="카드 관리">
 <p>경비 결제에 사용한 본인 카드의 식별 정보만 등록합니다. 전체 카드번호·CVC·비밀번호는 입력하지 마세요.</p>
 {error&&<p role="alert" className="form-error">{error}</p>}
 <ul className="expense-card-list">{cards.map(c=><li key={c.id}><span>{cardLabel(c)} <small>{c.active?'사용 중':'비활성'}</small></span><button className="button" disabled={busy} onClick={()=>setEditing(c)} aria-label={`${cardLabel(c)} 수정`}>수정</button></li>)}</ul>
 <button className="button" disabled={busy} onClick={()=>setEditing(null)}>+ 카드 등록</button>
 {editing!==undefined&&<form key={editing?.id||'new'} className="expense-card-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');try{const result=await savePaymentCard(editing?.id||null,editing?.version||0,{issuer:String(f.get('issuer')),nickname:String(f.get('nickname')),last4:String(f.get('last4')),active:f.has('active')});if('cards'in result&&result.cards){onChange(result.cards);setEditing(undefined);}else setError(('error'in result?result.error:undefined)||'저장할 수 없습니다.');}finally{setBusy(false);}}}>
 <h3>{editing?'카드 수정':'카드 등록'}</h3><fieldset disabled={busy}><label>카드사<input name="issuer" required maxLength={50} defaultValue={editing?.issuer}/></label><label>카드 별칭<input name="nickname" required maxLength={50} defaultValue={editing?.nickname}/></label><label>끝 4자리<input name="last4" required inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={editing?.last4}/></label><label><input name="active" type="checkbox" defaultChecked={editing?.active??true}/>활성 카드</label><p className="grid-help">비활성화해도 기존 경비의 카드 이력은 보존됩니다.</p><div className="grid-actions"><button type="button" className="button" onClick={()=>setEditing(undefined)}>취소</button><button className="button primary">{busy?'저장 중…':'카드 저장'}</button></div></fieldset></form>}
 </Drawer></>;
}
