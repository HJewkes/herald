# Task 06: Backlog Prioritizer

## Architectural Context

The prioritizer takes a list of `BacklogItem` objects and returns the subset that should be worked on in the current heartbeat. It filters by status (pending or recurring-and-due), sorts by priority then creation date, and returns items that fit within the budget. It uses `cron-parser` to evaluate recurring schedules.

## File Ownership

**May modify:**
- `src/backlog/prioritizer.ts`
- `__tests__/backlog/prioritizer.test.ts`

**Must not touch:**
- `src/types.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `BacklogItem`, `BudgetStatus` types

## Steps

### Step 1: Write the failing test

Create `__tests__/backlog/prioritizer.test.ts`:

```typescript
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
    expect(selected.map((i) => i.id)).toEqual(['high', 'med', 'low']);
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
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/backlog/prioritizer.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/backlog/prioritizer.ts`:

```typescript
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
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/backlog/prioritizer.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/backlog/prioritizer.ts __tests__/backlog/prioritizer.test.ts
git commit -m "Add backlog prioritizer with priority sorting and recurring schedule check"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/backlog/prioritizer.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Filters out done/blocked items
- [ ] Sorts by priority then creation date
- [ ] Respects budget hard cap
- [ ] Evaluates recurring schedules

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT implement multi-task selection — MVP picks one task per heartbeat
