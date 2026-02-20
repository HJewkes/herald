# Task 07: Budget Tracker

## Architectural Context

The budget tracker queries the Anthropic API for current billing period usage and returns a `BudgetStatus` object. This is the pre-run gate — Herald checks budget before invoking Claude Code. The tracker uses a simple HTTP fetch to the Anthropic admin API. For MVP, if the API call fails (no key, network issues), it returns a permissive status with a warning flag rather than blocking all work.

## File Ownership

**May modify:**
- `src/budget/tracker.ts`
- `__tests__/budget/tracker.test.ts`

**Must not touch:**
- `src/types.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `BudgetStatus`, `BudgetConfig` types

## Steps

### Step 1: Write the failing test

Create `__tests__/budget/tracker.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBudget, computeBudgetStatus } from '../../src/budget/tracker.js';
import type { BudgetConfig } from '../../src/types.js';

const config: BudgetConfig = {
  monthlyLimitUsd: 100,
  warningThresholdPct: 70,
  hardCapPct: 85,
  defaultMaxTokensPerTask: 50000,
};

describe('computeBudgetStatus', () => {
  it('computes healthy status when under warning', () => {
    const status = computeBudgetStatus(40, config);
    expect(status.usedUsd).toBe(40);
    expect(status.limitUsd).toBe(100);
    expect(status.usedPct).toBe(40);
    expect(status.overWarning).toBe(false);
    expect(status.overHardCap).toBe(false);
  });

  it('flags warning when over warning threshold', () => {
    const status = computeBudgetStatus(75, config);
    expect(status.overWarning).toBe(true);
    expect(status.overHardCap).toBe(false);
  });

  it('flags hard cap when over hard cap threshold', () => {
    const status = computeBudgetStatus(90, config);
    expect(status.overWarning).toBe(true);
    expect(status.overHardCap).toBe(true);
  });

  it('handles zero usage', () => {
    const status = computeBudgetStatus(0, config);
    expect(status.usedPct).toBe(0);
    expect(status.overWarning).toBe(false);
  });
});

describe('checkBudget', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns permissive status when API key is not set', async () => {
    const status = await checkBudget(config, '');
    expect(status.overHardCap).toBe(false);
    expect(status.usedUsd).toBe(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/budget/tracker.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/budget/tracker.ts`:

```typescript
import type { BudgetConfig, BudgetStatus } from '../types.js';

export function computeBudgetStatus(usedUsd: number, config: BudgetConfig): BudgetStatus {
  const usedPct = config.monthlyLimitUsd > 0
    ? Math.round((usedUsd / config.monthlyLimitUsd) * 100)
    : 0;

  return {
    usedUsd,
    limitUsd: config.monthlyLimitUsd,
    usedPct,
    overWarning: usedPct >= config.warningThresholdPct,
    overHardCap: usedPct >= config.hardCapPct,
  };
}

export async function checkBudget(config: BudgetConfig, apiKey: string): Promise<BudgetStatus> {
  if (!apiKey) {
    return computeBudgetStatus(0, config);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/usage', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!response.ok) {
      console.error(`Budget API returned ${response.status}, assuming permissive`);
      return computeBudgetStatus(0, config);
    }

    const data = (await response.json()) as { total_cost_usd?: number };
    const usedUsd = data.total_cost_usd ?? 0;
    return computeBudgetStatus(usedUsd, config);
  } catch (err) {
    console.error(`Budget check failed: ${err instanceof Error ? err.message : err}`);
    return computeBudgetStatus(0, config);
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/budget/tracker.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/budget/tracker.ts __tests__/budget/tracker.test.ts
git commit -m "Add budget tracker with Anthropic API usage check"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/budget/tracker.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Computes correct percentage thresholds
- [ ] Gracefully handles missing API key
- [ ] Gracefully handles API errors

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT block on API errors — fail open with permissive status for MVP
