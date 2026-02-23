import { describe, it, expect, vi, afterEach } from "vitest";
import {
  SlackClient,
  sendSlack,
  formatSummary,
} from "../../src/notify/slack.js";
import type { HeartbeatSummary } from "../../src/types.js";

function mockFetch(data: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe("formatSummary", () => {
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

    const msg = formatSummary(summary);
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

    const msg = formatSummary(summary);
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

    const msg = formatSummary(summary);
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

    const msg = formatSummary(summary);
    expect(msg).toContain("12/31");
  });
});

describe("SlackClient", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    delete process.env.HERALD_SLACK_TOKEN;
  });

  it("throws when no token is provided and env is unset", () => {
    delete process.env.HERALD_SLACK_TOKEN;
    expect(() => new SlackClient()).toThrow("HERALD_SLACK_TOKEN is not set");
  });

  it("uses provided token over env var", () => {
    process.env.HERALD_SLACK_TOKEN = "env-token";
    const fetcher = mockFetch({ ok: true, ts: "1234.5678", channel: "C123" });
    vi.stubGlobal("fetch", fetcher);

    const client = new SlackClient("explicit-token");
    client.postMessage("#test", "hello");

    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer explicit-token",
        }),
      }),
    );
  });

  it("postMessage returns ts and channel", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ ok: true, ts: "1234.5678", channel: "C123" }),
    );
    const client = new SlackClient("test-token");

    const result = await client.postMessage("#herald", "hello");

    expect(result).toEqual({ ts: "1234.5678", channel: "C123" });
  });

  it("postMessage throws when ts is missing from response", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, channel: "C123" }));
    const client = new SlackClient("test-token");

    await expect(client.postMessage("#herald", "hello")).rejects.toThrow(
      "missing ts",
    );
  });

  it("postMessage sends thread_ts when provided", async () => {
    const fetcher = mockFetch({ ok: true, ts: "1234.5679", channel: "C123" });
    vi.stubGlobal("fetch", fetcher);
    const client = new SlackClient("test-token");

    await client.postMessage("#herald", "reply", "1234.5678");

    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.thread_ts).toBe("1234.5678");
  });

  it("updateMessage calls chat.update", async () => {
    const fetcher = mockFetch({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    const client = new SlackClient("test-token");

    await client.updateMessage("C123", "1234.5678", "updated text");

    expect(fetcher).toHaveBeenCalledWith(
      "https://slack.com/api/chat.update",
      expect.objectContaining({
        body: JSON.stringify({
          channel: "C123",
          ts: "1234.5678",
          text: "updated text",
        }),
      }),
    );
  });

  it("addReaction calls reactions.add", async () => {
    const fetcher = mockFetch({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    const client = new SlackClient("test-token");

    await client.addReaction("C123", "1234.5678", "thumbsup");

    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toEqual({
      channel: "C123",
      timestamp: "1234.5678",
      name: "thumbsup",
    });
  });

  it("getHistory passes inclusive=false to avoid re-fetching", async () => {
    const fetcher = mockFetch({ ok: true, messages: [] });
    vi.stubGlobal("fetch", fetcher);
    const client = new SlackClient("test-token");

    await client.getHistory("C123", "1234.5678");

    const url = fetcher.mock.calls[0][0] as string;
    expect(url).toContain("inclusive=false");
  });

  it("getHistory returns parsed messages", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ok: true,
        messages: [
          { ts: "1.0", user: "U1", text: "hello", thread_ts: undefined },
          { ts: "2.0", user: "U2", text: "world" },
        ],
      }),
    );
    const client = new SlackClient("test-token");

    const messages = await client.getHistory("C123", "0");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({
      ts: "1.0",
      user: "U1",
      text: "hello",
      threadTs: undefined,
    });
    expect(messages[1].user).toBe("U2");
  });

  it("getReactions returns parsed reactions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            message: {
              reactions: [
                { name: "thumbsup", users: ["U1", "U2"] },
                { name: "eyes", users: ["U3"] },
              ],
            },
          }),
      }),
    );
    const client = new SlackClient("test-token");

    const reactions = await client.getReactions("C123", "1234.5678");

    expect(reactions).toHaveLength(2);
    expect(reactions[0]).toEqual({ name: "thumbsup", users: ["U1", "U2"] });
  });

  it("uploadFile uses getUploadURLExternal and completeUploadExternal", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            upload_url: "https://files.slack.com/upload/v1/abc",
            file_id: "F1",
          }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
    vi.stubGlobal("fetch", fetcher);
    const client = new SlackClient("test-token");

    const result = await client.uploadFile(
      "C123",
      "file content",
      "output.txt",
      "1234.5678",
    );

    expect(result.id).toBe("F1");
    expect(result.name).toBe("output.txt");
    expect(fetcher.mock.calls[0][0]).toContain("files.getUploadURLExternal");
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://files.slack.com/upload/v1/abc",
    );
    expect(fetcher.mock.calls[2][0]).toContain("files.completeUploadExternal");
  });

  it("createChannel extracts channel.id from response", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ok: true,
        channel: { id: "C_NEW", name: "herald-brain" },
      }),
    );
    const client = new SlackClient("test-token");

    const channelId = await client.createChannel("herald-brain");

    expect(channelId).toBe("C_NEW");
  });

  it("createChannel throws when response has no channel object", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true }));
    const client = new SlackClient("test-token");

    await expect(client.createChannel("herald-brain")).rejects.toThrow(
      "missing channel.id",
    );
  });

  it("authTest returns userId", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, user_id: "U123" }));
    const client = new SlackClient("test-token");

    const result = await client.authTest();

    expect(result).toEqual({ userId: "U123" });
  });

  it("authTest throws when user_id is missing", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true }));
    const client = new SlackClient("test-token");

    await expect(client.authTest()).rejects.toThrow("missing user_id");
  });

  it("throws on API error with method name", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ ok: false, error: "channel_not_found" }),
    );
    const client = new SlackClient("test-token");

    await expect(client.postMessage("#bad", "test")).rejects.toThrow(
      "Slack API error (chat.postMessage): channel_not_found",
    );
  });
});

describe("sendSlack (backward compat)", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    delete process.env.HERALD_SLACK_TOKEN;
  });

  it("throws when HERALD_SLACK_TOKEN is not set", async () => {
    delete process.env.HERALD_SLACK_TOKEN;
    await expect(sendSlack("#test", "hello")).rejects.toThrow(
      "HERALD_SLACK_TOKEN is not set",
    );
  });

  it("posts message to Slack API", async () => {
    process.env.HERALD_SLACK_TOKEN = "xoxb-test-token";
    vi.stubGlobal("fetch", mockFetch({ ok: true, ts: "1.0", channel: "C1" }));

    await sendSlack("#herald", "test message");

    expect(fetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer xoxb-test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: "#herald", text: "test message" }),
      },
    );
  });

  it("throws on Slack API error", async () => {
    process.env.HERALD_SLACK_TOKEN = "xoxb-test-token";
    vi.stubGlobal(
      "fetch",
      mockFetch({ ok: false, error: "channel_not_found" }),
    );

    await expect(sendSlack("#bad", "test")).rejects.toThrow(
      "channel_not_found",
    );
  });
});
