import { parseExpression } from 'cron-parser';
import type { BacklogItem, BudgetStatus, Priority } from '../types.js';

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function selectTasks(items: BacklogItem[], budget: BudgetStatus): BacklogItem[] {
  if (budget.overHardCap) return [];

  const eligible = items
    .filter((item) => {
      if (item.status === 'done' || item.status === 'blocked') return false;
      if (item.type === 'recurring') return isRecurringDue(item);
      return item.status === 'pending';
    })
    .sort((a, b) => {
      const priDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (priDiff !== 0) return priDiff;
      return a.created.localeCompare(b.created);
    });

  // MVP: return only the top task
  return eligible.slice(0, 1);
}

export function isRecurringDue(item: BacklogItem): boolean {
  if (item.type !== 'recurring') return false;
  if (!item.schedule) return false;
  if (!item.lastRun) return true;

  const lastRun = new Date(item.lastRun);
  const interval = parseExpression(item.schedule);
  const prev = interval.prev().toDate();

  return prev > lastRun;
}
