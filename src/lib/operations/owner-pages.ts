import type { TaskOwner } from './types';

const TASK_BATCH = 64;
const PAGE_SIZE = 500;
type OwnerPage = (taskIds: string[], from: number, to: number) => Promise<TaskOwner[]>;

// Keep query URLs bounded and retain all owners beyond the provider's row limit.
// The caller supplies only tasks already read under its authenticated RLS scope.
export async function loadTaskOwners(taskIds: string[], page: OwnerPage): Promise<TaskOwner[]> {
 const ids = [...new Set(taskIds)].sort(), owners: TaskOwner[] = [];
 for (let start = 0; start < ids.length; start += TASK_BATCH) {
  const batch = ids.slice(start, start + TASK_BATCH);
  for (let from = 0;; from += PAGE_SIZE) {
   const rows = await page(batch, from, from + PAGE_SIZE - 1);
   owners.push(...rows);
   if (rows.length < PAGE_SIZE) break;
  }
 }
 return owners;
}
