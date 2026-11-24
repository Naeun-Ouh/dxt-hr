import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/** Presentation only. Callers retain authorization and action ownership. */
export function Button({variant='default', size='default', loading=false, disabled, className='', children, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'primary'|'default'|'text'|'danger';size?:'small'|'default'|'large';loading?:boolean}) {
 return <button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={`button ${variant} size-${size} ${className}`}>{loading && <span className="button-spinner" aria-hidden="true"/>}{children}</button>;
}
export function PageHeader({title,description,actions,children,className=''}:{title:ReactNode;description?:ReactNode;actions?:ReactNode;children?:ReactNode;className?:string}) {
 return <div className={`page-heading heading-row ui-page-header ${className}`}><div>{children}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</div>;
}
export type StatusTone='neutral'|'info'|'success'|'warning'|'error';
const tones:Record<string,StatusTone>={ACTIVE:'success',IN_USE:'success',APPROVED:'success',COMPLETED:'success',PAID:'success',SENT:'info',VIEWED:'info',SUBMITTED:'info',PROCESSING:'info',READY_TO_SEND:'info',PENDING:'warning',EMPLOYEE_SIGNED:'warning',REPAIR:'warning',WARNING:'warning',ERROR:'error',DECLINED:'error',REJECTED:'error',LOST:'error'};
export function StatusTag({status,tone,children}:{status?:string;tone?:StatusTone;children:ReactNode}) {return <span className={`ui-status tone-${tone || tones[status || ''] || 'neutral'}`}>{children}</span>;}
export function SectionCard({className='',...props}:HTMLAttributes<HTMLElement>) {return <section {...props} className={`surface ${className}`}/>;}
export function SummaryCard({label,value,unit}:{label:ReactNode;value:ReactNode;unit?:ReactNode}) {return <SectionCard className="ui-summary"><p>{label}</p><strong>{value}</strong>{unit && <span>{unit}</span>}</SectionCard>;}
export function DataTable({head,children,label}:{head:string[];children:ReactNode;label?:string}) {return <div className="project-table table-scroll ui-table-scroll" tabIndex={0} role="region" aria-label={label || head.join(' · ')}><table><thead><tr>{head.map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;}
export function EmptyState({children}:{children:ReactNode}) {return <div className="table-empty">{children}</div>;}
export function Alert({tone='info',title,children}:{tone?:StatusTone;title?:ReactNode;children:ReactNode}) {return <aside className={`ui-alert tone-${tone}`} role={tone==='error'?'alert':undefined}>{title && <strong>{title}</strong>}<div>{children}</div></aside>;}
export function FilterBar({className='',...props}:React.ComponentProps<'form'>) {return <form {...props} className={`filter-bar ${className}`}/>;}
/** Control keeps its native label/required/error attributes; IDs are caller-owned. */
export function FormField({label,required,children,hint,error,name}:{label:ReactNode;required?:boolean;children:ReactNode;hint?:ReactNode;error?:ReactNode;name:string}) {
 return <label className="field"><span>{label}{required && <span className="required"> *</span>}</span>{children}{hint && <small id={`${name}-hint`}>{hint}</small>}{error && <small className="field-error" id={`${name}-error`}>{error}</small>}</label>;
}

export const DataGrid = DataTable;
export const KPIStat = SummaryCard;
export function SummaryStrip({children,label='업무 요약'}:{children:ReactNode;label?:string}) {return <div className="summary-strip" role="group" aria-label={label}>{children}</div>;}
/** URL-backed navigation; caller filters links using existing capabilities. */
export function CompactTabs({children,label}:{children:ReactNode;label:string}) {return <nav className="compact-tabs employee-tabs" aria-label={label}>{children}</nav>;}
