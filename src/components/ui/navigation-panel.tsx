'use client';
import {useEffect,useRef,type ReactNode} from 'react';
export function NavigationPanel({children}:{children:ReactNode}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const media=window.matchMedia('(max-width:760px)');const update=()=>{if(ref.current)ref.current.open=!media.matches;};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return <details ref={ref} className="navigation-panel" open><summary>메뉴</summary>{children}</details>;
}
