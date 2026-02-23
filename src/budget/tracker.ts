import { readEntries } from "../journal/logger.js";
import type { BudgetConfig, BudgetStatus } from "../types.js";

export function getWeekStart(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getDayOfWeek(now: Date): number {
  const day = now.getDay();
  return day === 0 ? 7 : day; // Monday=1 ... Sunday=7
}

export function computePaceCap(
  dayOfWeek: number,
  bufferDays: number,
  weeklyLimit: number,
): number {
  return Math.floor(((dayOfWeek + bufferDays) / 7) * weeklyLimit);
}

export function computeBudgetStatus(
  usedTokens: number,
  dayOfWeek: number,
  config: BudgetConfig,
): BudgetStatus {
  const paceCap = computePaceCap(
    dayOfWeek,
    config.bufferDays,
    config.weeklyTokenLimit,
  );
  const usedPct =
    config.weeklyTokenLimit > 0
      ? Math.round((usedTokens / config.weeklyTokenLimit) * 100)
      : 0;
  const paceCapPct =
    config.weeklyTokenLimit > 0
      ? Math.round((paceCap / config.weeklyTokenLimit) * 100)
      : 0;

  return {
    usedTokens,
    paceCap,
    weeklyLimit: config.weeklyTokenLimit,
    dayOfWeek,
    usedPct,
    paceCapPct,
    overPace: usedTokens >= paceCap,
  };
}

export function checkBudget(
  config: BudgetConfig,
  journalDir: string,
  now = new Date(),
): BudgetStatus {
  const weekStart = getWeekStart(now);
  const entries = readEntries(journalDir, 500);

  let usedTokens = 0;
  for (const entry of entries) {
    const entryDate = new Date(entry.timestamp);
    if (entryDate >= weekStart) {
      usedTokens += entry.tokensUsed ?? 0;
    }
  }

  const dayOfWeek = getDayOfWeek(now);
  return computeBudgetStatus(usedTokens, dayOfWeek, config);
}
