import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectTasks, isRecurringDue } from '../../src/backlog/prioritizer.js';
import type { BacklogItem, BudgetStatus } from '../../src/types.js';

function makeItem(overrides: Partial<BacklogItem>): BacklogItem {
  return {
    id: 'test',
    type: 'task',
    priority: 'medium',
    status: 'pending',
    allowedTools: [],
    maxTokens: 50000,
    tags: [],
    created: '2026-02-20',
    lastRun: null,
    title: 'Test',
    body: '',
    filePath: '/fake/test.md',
    ...overrides,
  };
}

const healthyBudget: BudgetStatus = {
  usedUsd: 40,
  limitUsd: 100,
  usedPct: 40,
  overWarning: false,
  overHardCap: false,
};

describe('selectTasks', () => {
  it('filters out done and blocked items', () => {
    const items = [
      makeItem({ id: 'a', status: 'pending' }),
      makeItem({ id: 'b', status: 'done' }),
      makeItem({ id: 'c', status: 'blocked' }),
    ];
    const selected = selectTasks(items, healthyBudget);
    expect(selected.map((i) => i.id)).toEqual(['a']);
  });

  it('sorts by priority: high > medium > low', () => {
    const items = [
      makeItem({ id: 'low', priority: 'low' }),
      makeItem({ id: 'high', priority: 'high' }),
      makeItem({ id: 'med', priority: 'medium' }),
    ];
    const selected = selectTasks(items, healthyBudget);
    expect(selected[0].id).toBe('high');
  });

  it('returns empty when budget is over hard cap', () => {
    const overBudget: BudgetStatus = { ...healthyBudget, overHardCap: true };
    const items = [makeItem({ id: 'a', status: 'pending' })];
    const selected = selectTasks(items, overBudget);
    expect(selected).toEqual([]);
  });

  it('returns only the first task (single-task MVP)', () => {
    const items = [
      makeItem({ id: 'a', priority: 'high' }),
      makeItem({ id: 'b', priority: 'high' }),
    ];
    const selected = selectTasks(items, healthyBudget);
    expect(selected).toHaveLength(1);
  });
});

describe('isRecurringDue', () => {
  it('returns true when lastRun is null', () => {
    const item = makeItem({ type: 'recurring', schedule: '0 9 * * *', lastRun: null });
    expect(isRecurringDue(item)).toBe(true);
  });

  it('returns false for non-recurring items', () => {
    const item = makeItem({ type: 'task' });
    expect(isRecurringDue(item)).toBe(false);
  });

  it('handles invalid cron expression gracefully', () => {
    const item = makeItem({
      type: 'recurring',
      schedule: 'not-a-cron',
      lastRun: '2026-02-19T09:00:00Z',
    });
    expect(isRecurringDue(item)).toBe(false);
  });

  it('recurring item without schedule returns false', () => {
    const item = makeItem({ type: 'recurring', schedule: undefined });
    expect(isRecurringDue(item)).toBe(false);
  });

  it('returns false when lastRun is after the most recent scheduled time', () => {
    // Schedule: daily at 09:00. If lastRun is after today's 09:00, not due yet.
    const now = new Date();
    const recentRun = new Date(now.getTime() + 60_000).toISOString();
    const item = makeItem({
      type: 'recurring',
      schedule: '0 9 * * *',
      lastRun: recentRun,
    });
    expect(isRecurringDue(item)).toBe(false);
  });
});
