'use client';
import {useEffect,useId,useRef,useState,type ReactNode,type InputHTMLAttributes} from 'react';

/** Presentation only: render only data already authorized by the caller. */
export function WorkToolbar({children,actions,label='검색 및 작업'}:{children?:ReactNode;actions?:ReactNode;label?:string}){
 return <div className="work-toolbar" role="group" aria-label={label}><div className="work-toolbar-controls">{children}</div>{actions&&<div className="work-toolbar-actions">{actions}</div>}</div>;
}
export const GridToolbar=WorkToolbar;
export function SearchInput({label,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string}){return <input {...props} className={`work-search ${props.className||''}`} type="search" aria-label={label}/>;}
export function FilterPopover({children,count=0}:{children:ReactNode;count?:number}){
 const [open,setOpen]=useState(false),id=useId(),button=useRef<HTMLButtonElement>(null);
 return <div className="filter-popover" onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}}}>
 <button ref={button} type="button" className="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>필터{count?` ${count}`:''} ▾</button>
 {open&&<div id={id} className="filter-popover-panel">{children}</div>}</div>;
}
export function Modal({open,onClose,title,children,drawer=false}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;drawer?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),heading=useId();
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();},[open]);
 return <dialog ref={ref} className={`work-dialog${drawer?' work-drawer':''}`} aria-labelledby={heading} onKeyDown={e=>{
 if(e.key!=='Tab')return;
 const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length>0);
 const first=controls[0],last=controls.at(-1);
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 }} onCancel={e=>{e.preventDefault();onClose();}} onClose={onClose}>
 <header className="work-dialog-heading"><h2 id={heading}>{title}</h2><button type="button" className="button" aria-label={`${title} 닫기`} onClick={onClose}>닫기</button></header><div className="work-dialog-body">{open&&children}</div></dialog>;
}
export function Drawer(props:Omit<React.ComponentProps<typeof Modal>,'drawer'>){return <Modal {...props} drawer/>;}
export function DisclosurePanel({label,title,children,drawer=false}:{label:string;title:string;children:ReactNode;drawer?:boolean}){
 const [open,setOpen]=useState(false);
 return <><button type="button" className="button" onClick={()=>setOpen(true)}>{label}</button><Modal open={open} onClose={()=>setOpen(false)} title={title} drawer={drawer}>{children}</Modal></>;
}
export function RowExpansion({cells,children,label,colSpan}:{cells:ReactNode;children:ReactNode;label:string;colSpan:number}){
 const [open,setOpen]=useState(false),id=useId();
 return <><tr>{cells}<td><button className="button text size-small" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>{label} {open?'▴':'▾'}</button></td></tr>{open&&<tr className="work-expanded-row"><td colSpan={colSpan}><div id={id}>{children}</div></td></tr>}</>;
}
