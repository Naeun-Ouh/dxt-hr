import {carryoverWorkspace} from '@/lib/carryover/data';
import {CarryoverWorkspace} from './workspace';
export async function CarryoverScreen({admin=false}:{admin?:boolean}){return <CarryoverWorkspace admin={admin} {...await carryoverWorkspace(admin)}/>;}
