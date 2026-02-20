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

  it('throws when API key is not set', async () => {
    await expect(checkBudget(config, '')).rejects.toThrow(
      'ANTHROPIC_API_KEY is not set',
    );
  });

  it('parses successful API response into budget status', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ total_cost_usd: 75 }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const status = await checkBudget(config, 'sk-test-key');

    expect(fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/usage', {
      headers: {
        'x-api-key': 'sk-test-key',
        'anthropic-version': '2023-06-01',
      },
    });
    expect(status.usedUsd).toBe(75);
    expect(status.usedPct).toBe(75);
    expect(status.overWarning).toBe(true);
    expect(status.overHardCap).toBe(false);

    vi.unstubAllGlobals();
  });

  it('returns permissive status on non-200 API response', async () => {
    const mockResponse = { ok: false, status: 500 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const status = await checkBudget(config, 'sk-test-key');

    expect(status.usedUsd).toBe(0);
    expect(status.overHardCap).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('500'));

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('returns permissive status on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const status = await checkBudget(config, 'sk-test-key');

    expect(status.usedUsd).toBe(0);
    expect(status.overHardCap).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Network timeout'));

    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('handles API response missing total_cost_usd field', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const status = await checkBudget(config, 'sk-test-key');

    expect(status.usedUsd).toBe(0);
    expect(status.overHardCap).toBe(false);

    vi.unstubAllGlobals();
  });
});
