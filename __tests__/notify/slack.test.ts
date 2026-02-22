import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSlack, formatSummary } from '../../src/notify/slack.js';
import type { HeartbeatSummary } from '../../src/types.js';

describe('formatSummary', () => {
  it('formats a heartbeat summary with Slack markdown', () => {
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
    expect(msg).toContain('*Herald Report');
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
    expect(msg).toContain('*Herald Report');
    expect(msg).toContain('No tasks');
  });
});

describe('sendSlack', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('throws when HERALD_SLACK_TOKEN is not set', async () => {
    delete process.env.HERALD_SLACK_TOKEN;
    await expect(sendSlack('#test', 'hello')).rejects.toThrow(
      'HERALD_SLACK_TOKEN is not set',
    );
  });

  it('posts message to Slack API', async () => {
    process.env.HERALD_SLACK_TOKEN = 'xoxb-test-token';
    const mockResponse = { ok: true, json: () => Promise.resolve({ ok: true }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await sendSlack('#herald', 'test message');

    expect(fetch).toHaveBeenCalledWith('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer xoxb-test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: '#herald', text: 'test message' }),
    });

    delete process.env.HERALD_SLACK_TOKEN;
    vi.unstubAllGlobals();
  });

  it('throws on Slack API error', async () => {
    process.env.HERALD_SLACK_TOKEN = 'xoxb-test-token';
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(sendSlack('#bad', 'test')).rejects.toThrow('channel_not_found');

    delete process.env.HERALD_SLACK_TOKEN;
    vi.unstubAllGlobals();
  });
});
