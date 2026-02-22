import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatSummary, sendIMessage } from '../../src/notify/imessage.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { HeartbeatSummary } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
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
        usedTokens: 500000,
        paceCap: 2000000,
        weeklyLimit: 5000000,
        dayOfWeek: 3,
        usedPct: 10,
        paceCapPct: 40,
        overPace: false,
      },
    };

    const msg = formatSummary(summary);
    expect(msg).toContain('Herald Report');
    expect(msg).toContain('Fix brain search');
    expect(msg).toContain('Add fuzzy matching');
    expect(msg).toContain('auto-archive');
    expect(msg).toContain('day 3/7');
  });

  it('handles empty summary', () => {
    const summary: HeartbeatSummary = {
      timestamp: '2026-02-20T09:00:00Z',
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

    const msg = formatSummary(summary);
    expect(msg).toContain('Herald Report');
    expect(msg).toContain('No tasks');
  });
});

describe('sendIMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes script to temp file and calls osascript', () => {
    sendIMessage('+15551234567', 'Hello from Herald');
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain('Hello from Herald');
    expect(scriptContent).toContain('+15551234567');
    expect(vi.mocked(execFileSync)).toHaveBeenCalledOnce();
    const [cmd, args] = vi.mocked(execFileSync).mock.calls[0];
    expect(cmd).toBe('osascript');
    expect((args as string[])[0]).toMatch(/herald-imessage-.*\.scpt$/);
  });

  it('escapes double quotes in message', () => {
    sendIMessage('+15551234567', 'Test "quotes" & backslash\\');
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).not.toContain('"quotes"');
    expect(scriptContent).toContain('\\"quotes\\"');
  });

  it('escapes newlines in message', () => {
    sendIMessage('+15551234567', 'Line one\nLine two');
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain('Line one\\nLine two');
  });

  it('handles single quotes in message', () => {
    sendIMessage('+15551234567', "it's a test");
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain("it's a test");
  });

  it('escapes recipient', () => {
    sendIMessage('user"@evil.com', 'Hello');
    const scriptContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(scriptContent).toContain('user\\"@evil.com');
    expect(scriptContent).not.toContain('user"@evil.com');
  });
});
