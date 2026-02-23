import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeBudgetStatus,
  checkBudget,
  getWeekStart,
  getDayOfWeek,
  computePaceCap,
} from "../../src/budget/tracker.js";
import type { BudgetConfig } from "../../src/types.js";

vi.mock("../../src/journal/logger.js", () => ({
  readEntries: vi.fn(),
}));

import { readEntries } from "../../src/journal/logger.js";

const config: BudgetConfig = {
  weeklyTokenLimit: 5000000,
  bufferDays: 1,
  defaultMaxTokensPerTask: 50000,
};

describe("getWeekStart", () => {
  it("returns Monday 00:00 for a Wednesday", () => {
    const wed = new Date("2026-02-18T14:00:00"); // Wednesday
    const start = getWeekStart(wed);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(16);
  });

  it("returns Monday 00:00 for a Sunday", () => {
    const sun = new Date("2026-02-22T10:00:00"); // Sunday
    const start = getWeekStart(sun);
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getDate()).toBe(16);
  });

  it("returns same day for a Monday", () => {
    const mon = new Date("2026-02-16T09:00:00"); // Monday
    const start = getWeekStart(mon);
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(16);
  });
});

describe("getDayOfWeek", () => {
  it("returns 1 for Monday", () => {
    expect(getDayOfWeek(new Date("2026-02-16T12:00:00"))).toBe(1);
  });

  it("returns 7 for Sunday", () => {
    expect(getDayOfWeek(new Date("2026-02-22T12:00:00"))).toBe(7);
  });

  it("returns 3 for Wednesday", () => {
    expect(getDayOfWeek(new Date("2026-02-18T12:00:00"))).toBe(3);
  });
});

describe("computePaceCap", () => {
  it("calculates pace cap with 1-day buffer", () => {
    // Day 3 (Wed), buffer 1, limit 7M → (4/7) * 7M = 4M
    expect(computePaceCap(3, 1, 7000000)).toBe(4000000);
  });

  it("caps at weekly limit on day 7 with buffer", () => {
    // Day 7 (Sun), buffer 1 → (8/7) * 5M = 5.71M (over 100% is fine, just means no cap on Sunday)
    const cap = computePaceCap(7, 1, 5000000);
    expect(cap).toBeGreaterThan(5000000);
  });
});

describe("computeBudgetStatus", () => {
  it("returns not over pace when usage is below cap", () => {
    const status = computeBudgetStatus(1000000, 3, config);
    expect(status.overPace).toBe(false);
    expect(status.usedPct).toBe(20);
  });

  it("returns over pace when usage exceeds cap", () => {
    // Day 1, buffer 1 → cap = (2/7)*5M ≈ 1.43M
    const status = computeBudgetStatus(2000000, 1, config);
    expect(status.overPace).toBe(true);
  });

  it("includes day and token info", () => {
    const status = computeBudgetStatus(500000, 4, config);
    expect(status.dayOfWeek).toBe(4);
    expect(status.usedTokens).toBe(500000);
    expect(status.weeklyLimit).toBe(5000000);
  });
});

describe("checkBudget", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sums tokens from current week journal entries", () => {
    const now = new Date("2026-02-18T14:00:00"); // Wednesday
    vi.mocked(readEntries).mockReturnValue([
      {
        timestamp: "2026-02-18T10:00:00Z",
        taskId: "a",
        taskTitle: "A",
        status: "success",
        durationMs: 1000,
        tokensUsed: 100000,
      },
      {
        timestamp: "2026-02-17T10:00:00Z",
        taskId: "b",
        taskTitle: "B",
        status: "success",
        durationMs: 1000,
        tokensUsed: 200000,
      },
      {
        timestamp: "2026-02-10T10:00:00Z",
        taskId: "c",
        taskTitle: "C",
        status: "success",
        durationMs: 1000,
        tokensUsed: 999999,
      }, // last week
    ]);

    const status = checkBudget(config, "/fake/journal", now);
    expect(status.usedTokens).toBe(300000); // only a + b
  });

  it("returns zero usage when no journal entries exist", () => {
    vi.mocked(readEntries).mockReturnValue([]);
    const status = checkBudget(config, "/fake/journal");
    expect(status.usedTokens).toBe(0);
    expect(status.overPace).toBe(false);
  });

  it("handles entries with missing tokensUsed", () => {
    const now = new Date("2026-02-18T14:00:00");
    vi.mocked(readEntries).mockReturnValue([
      {
        timestamp: "2026-02-18T10:00:00Z",
        taskId: "a",
        taskTitle: "A",
        status: "success",
        durationMs: 1000,
      },
    ]);

    const status = checkBudget(config, "/fake/journal", now);
    expect(status.usedTokens).toBe(0);
  });
});
