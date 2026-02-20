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
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Budget cannot be verified — blocking run for safety.',
    );
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
