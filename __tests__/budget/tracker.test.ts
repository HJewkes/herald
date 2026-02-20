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
