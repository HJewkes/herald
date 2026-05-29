import { describe, it, expect } from "vitest";
import {
  formatSlackSummary,
  formatIMessageSummary,
} from "../../../src/plugins/backlog/report.js";
import type { HeartbeatSummary } from "../../../src/plugins/backlog/types.js";

describe("formatSlackSummary", () => {
  it("formats a heartbeat summary with Slack markdown", () => {
    const summary: HeartbeatSummary = {
      timestamp: "2026-02-20T09:00:00Z",
      tasksCompleted: ["Fix brain search"],
      tasksSkipped: ["Add fuzzy matching"],
      tasksBlocked: [],
      needsInput: ["Should stale notes auto-archive?"],
      budget: {
        usedTokens: 500000,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 10,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatSlackSummary(summary);
    expect(msg).toContain("*Herald Report");
    expect(msg).toContain("Fix brain search");
    expect(msg).toContain("Add fuzzy matching");
    expect(msg).toContain("auto-archive");
    expect(msg).toContain("day 3/7");
    expect(msg).not.toContain("No tasks");
  });

  it("handles empty summary", () => {
    const summary: HeartbeatSummary = {
      timestamp: "2026-02-20T09:00:00Z",
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: [],
      budget: {
        usedTokens: 0,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 0,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatSlackSummary(summary);
    expect(msg).toContain("*Herald Report");
    expect(msg).toContain("No tasks");
  });

  it('does not show "No tasks" when only needsInput has entries', () => {
    const summary: HeartbeatSummary = {
      timestamp: "2026-02-20T09:00:00Z",
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: ["Confirm migration?"],
      budget: {
        usedTokens: 0,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 0,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatSlackSummary(summary);
    expect(msg).toContain("Confirm migration");
    expect(msg).not.toContain("No tasks");
  });

  it("uses UTC date components", () => {
    const summary: HeartbeatSummary = {
      timestamp: "2026-12-31T23:59:00Z",
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: [],
      budget: {
        usedTokens: 0,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 0,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatSlackSummary(summary);
    expect(msg).toContain("12/31");
  });
});

describe("formatIMessageSummary", () => {
  it("formats a heartbeat summary into a readable message", () => {
    const summary: HeartbeatSummary = {
      timestamp: "2026-02-20T09:00:00Z",
      tasksCompleted: ["Fix brain search"],
      tasksSkipped: ["Add fuzzy matching"],
      tasksBlocked: [],
      needsInput: ["Should stale notes auto-archive?"],
      budget: {
        usedTokens: 500000,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 10,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatIMessageSummary(summary);
    expect(msg).toContain("Herald Report");
    expect(msg).toContain("Fix brain search");
    expect(msg).toContain("Add fuzzy matching");
    expect(msg).toContain("auto-archive");
    expect(msg).toContain("day 3/7");
  });

  it("handles empty summary", () => {
    const summary: HeartbeatSummary = {
      timestamp: "2026-02-20T09:00:00Z",
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: [],
      budget: {
        usedTokens: 0,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 0,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatIMessageSummary(summary);
    expect(msg).toContain("Herald Report");
    expect(msg).toContain("No tasks");
  });
});
