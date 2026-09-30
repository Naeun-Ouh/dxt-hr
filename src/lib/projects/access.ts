import { can, type Principal } from '../permissions';
import type { Employee } from '../employees/types';
type ScopeEmployee = Pick<Employee, 'id' | 'department_id'>;
// Mirrors can_read_career RLS. Project management never implies career read scope.
export function canReadCareerFor(principal: Principal, self: ScopeEmployee | undefined, target: ScopeEmployee) {
 return Boolean(can(principal,'EMPLOYEE_ACCESS') && self && (self.id === target.id || (can(principal,'TEAM_CAREER_READ') && self.department_id && self.department_id === target.department_id)));
}
