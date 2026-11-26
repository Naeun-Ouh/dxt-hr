'use client';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import type {Principal} from '@/lib/permissions';
import {modeFor,workspaceFor,workspacesFor} from '@/lib/workspaces';
export function WorkspaceNavigation({principal,tabs=false}:{principal:Principal;tabs?:boolean}){
 const path=usePathname(),query=useSearchParams(),mode=modeFor(principal,path,query.get('workspace'));
 const workspaces=workspacesFor(principal,mode),active=workspaceFor(principal,mode,path),management=workspacesFor(principal,'admin');
 if(tabs)return active&&active.links.length>1?<nav className="compact-tabs employee-tabs workspace-tabs" aria-label={`${active.label} 업무 메뉴`}>{active.links.map(l=>{const selected=l.href.split('?')[0]===path;return <Link key={l.href} href={l.href} aria-current={selected?'page':undefined}>{l.label}</Link>;})}</nav>:null;
 return <>{management.length>0&&<nav className="workspace-mode" aria-label="업무 모드"><Link href="/" aria-current={mode==='employee'?'page':undefined}>내 업무</Link><Link href={management[0].links[0].href} aria-current={mode==='admin'?'page':undefined}>관리 업무</Link></nav>}<nav aria-label="주 메뉴">{workspaces.map(w=><Link className={`nav-link${w.id===active?.id?' active':''}`} aria-current={w.id===active?.id?'page':undefined} key={w.id} href={w.links[0].href}><img className="nav-icon" src={`/figma/${w.icon}.svg`} alt=""/><span>{w.label}</span></Link>)}</nav></>;
}
