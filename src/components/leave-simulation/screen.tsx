import {simulationData} from '@/lib/leave-simulation/data';
import {LeaveSimulationWorkspace} from './workspace';
export async function LeaveSimulationScreen(){const {people}=await simulationData();return <LeaveSimulationWorkspace people={people}/>;}
