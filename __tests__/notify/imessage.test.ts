import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatSummary, sendIMessage } from '../../src/notify/imessage.js';
import { execSync } from 'node:child_process';
import type { HeartbeatSummary } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('formatSummary', () => {
  it('formats a heartbeat summary into a readable message', () => {
    const summary: HeartbeatSummary = {
      timestamp: '2026-02-20T09:00:00Z',
      tasksCompleted: ['Fix brain search'],
      tasksSkipped: ['Add fuzzy matching'],
      tasksBlocked: [],
      needsInput: ['Should stale notes auto-archive?'],
      budget: {
        usedUsd: 42,
        limitUsd: 100,
        usedPct: 42,
        overWarning: false,
        overHardCap: false,
      },
    };

    const msg = formatSummary(summary);
    expect(msg).toContain('Herald Report');
    expect(msg).toContain('Fix brain search');
    expect(msg).toContain('Add fuzzy matching');
    expect(msg).toContain('auto-archive');
    expect(msg).toContain('$42/$100');
  });

  it('handles empty summary', () => {
    const summary: HeartbeatSummary = {
      timestamp: '2026-02-20T09:00:00Z',
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: [],
      budget: {
        usedUsd: 0,
        limitUsd: 100,
        usedPct: 0,
        overWarning: false,
        overHardCap: false,
      },
    };

    const msg = formatSummary(summary);
    expect(msg).toContain('Herald Report');
    expect(msg).toContain('No tasks');
  });
});

describe('sendIMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls osascript with correct AppleScript', () => {
    sendIMessage('+15551234567', 'Hello from Herald');
    expect(vi.mocked(execSync)).toHaveBeenCalledOnce();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain('osascript');
    expect(cmd).toContain('Hello from Herald');
    expect(cmd).toContain('+15551234567');
  });

  it('escapes special characters in message', () => {
    sendIMessage('+15551234567', 'Test "quotes" & backslash\\');
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).not.toContain('"quotes"');
  });
});
