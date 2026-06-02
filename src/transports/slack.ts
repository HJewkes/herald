import { SocketModeClient } from "@slack/socket-mode";
import type { InboundMsg, Transport } from "../core/contract.js";
import type {
  SlackPostResult,
  SlackMessage,
  SlackReaction,
  SlackFile,
} from "../types.js";

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string | { id: string; name: string };
  messages?: SlackApiMessage[];
  file?: { id: string; name: string; permalink: string };
  upload_url?: string;
  file_id?: string;
}

interface SlackApiMessage {
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
}

interface SlackReactionsResponse {
  ok: boolean;
  error?: string;
  message?: {
    reactions?: Array<{ name: string; users: string[] }>;
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Slack API: missing ${label} in response`);
  }
  return value;
}

export class SlackClient {
  private readonly token: string;

  constructor(token?: string) {
    const resolved = token ?? process.env.HERALD_SLACK_TOKEN;
    if (!resolved) {
      throw new Error("HERALD_SLACK_TOKEN is not set");
    }
    this.token = resolved;
  }

  private async call(
    method: string,
    body: Record<string, unknown>,
  ): Promise<SlackApiResponse> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (${method}): ${data.error}`);
    }
    return data;
  }

  async postMessage(
    channel: string,
    text: string,
    threadTs?: string,
  ): Promise<SlackPostResult> {
    const body: Record<string, unknown> = { channel, text };
    if (threadTs) body.thread_ts = threadTs;
    const data = await this.call("chat.postMessage", body);
    return {
      ts: requireString(data.ts, "ts"),
      channel: requireString(
        typeof data.channel === "string" ? data.channel : undefined,
        "channel",
      ),
    };
  }

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
  ): Promise<void> {
    await this.call("chat.update", { channel, ts, text });
  }

  async addReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.call("reactions.add", { channel, timestamp: ts, name });
  }

  async getHistory(
    channel: string,
    oldest: string,
    limit = 100,
  ): Promise<SlackMessage[]> {
    const params = new URLSearchParams({
      channel,
      oldest,
      limit: String(limit),
      inclusive: "false",
    });
    const response = await fetch(
      `https://slack.com/api/conversations.history?${params}`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
      },
    );
    const data = (await response.json()) as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (conversations.history): ${data.error}`);
    }
    return (data.messages ?? []).map((m) => ({
      ts: m.ts,
      user: m.user ?? "",
      text: m.text ?? "",
      threadTs: m.thread_ts,
    }));
  }

  async getReactions(channel: string, ts: string): Promise<SlackReaction[]> {
    const params = new URLSearchParams({
      channel,
      timestamp: ts,
      full: "true",
    });
    const response = await fetch(
      `https://slack.com/api/reactions.get?${params}`,
      {
        headers: { Authorization: `Bearer ${this.token}` },
      },
    );
    const data = (await response.json()) as SlackReactionsResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (reactions.get): ${data.error}`);
    }
    return (data.message?.reactions ?? []).map((r) => ({
      name: r.name,
      users: r.users,
    }));
  }

  async uploadFile(
    channel: string,
    content: string,
    filename: string,
    threadTs?: string,
  ): Promise<SlackFile> {
    const contentBytes = new TextEncoder().encode(content);

    const urlData = await this.call("files.getUploadURLExternal", {
      filename,
      length: contentBytes.byteLength,
    });
    const uploadUrl = requireString(urlData.upload_url, "upload_url");
    const fileId = requireString(urlData.file_id, "file_id");

    await fetch(uploadUrl, {
      method: "POST",
      body: contentBytes,
    });

    const completeFile: Record<string, unknown> = { id: fileId };
    if (threadTs) completeFile.thread_ts = threadTs;

    await this.call("files.completeUploadExternal", {
      files: [completeFile],
      channel_id: channel,
    });

    return { id: fileId, name: filename, permalink: "" };
  }

  async createChannel(name: string): Promise<string> {
    const data = await this.call("conversations.create", { name });
    const ch = data.channel;
    if (typeof ch === "object" && ch !== null && "id" in ch) {
      return ch.id;
    }
    throw new Error(
      "Slack API: missing channel.id in conversations.create response",
    );
  }

  async inviteToChannel(channel: string, users: string): Promise<void> {
    await this.call("conversations.invite", { channel, users });
  }

  async authTest(): Promise<{ userId: string }> {
    const response = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      user_id?: string;
    };
    if (!data.ok) {
      throw new Error(`Slack API error (auth.test): ${data.error}`);
    }
    return { userId: requireString(data.user_id, "user_id") };
  }
}

// Backward-compatible exports

export async function sendSlack(channel: string, text: string): Promise<void> {
  const client = new SlackClient();
  await client.postMessage(channel, text);
}

// --- Transport adapter (Socket Mode inbound + send) ---

/** The Slack message event fields the transport reads. */
interface SlackMessageEvent {
  type: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  subtype?: string;
  bot_id?: string;
}

/** A Socket Mode event envelope (the relevant subset). */
interface SocketEnvelope {
  ack: () => Promise<void>;
  event: SlackMessageEvent;
}

/** The slice of SocketModeClient the transport depends on (injectable for tests). */
export interface SocketModeEmitter {
  on(event: string, listener: (envelope: SocketEnvelope) => void): unknown;
  start(): Promise<unknown>;
}

export interface SlackTransportOptions {
  botToken?: string;
  appToken?: string;
  client?: SlackClient;
  /** Override the Socket Mode client (tests inject a fake emitter). */
  makeSocket?: (appToken: string) => SocketModeEmitter;
}

/**
 * Slack channel adapter implementing the harness Transport contract. `send`
 * reuses the fetch-based SlackClient; `listen` opens a Socket Mode WebSocket
 * (no public port) and normalizes inbound message events to InboundMsg.
 */
export class SlackTransport implements Transport {
  private readonly client: SlackClient;
  private readonly appToken: string;
  private readonly makeSocket: (appToken: string) => SocketModeEmitter;

  constructor(opts: SlackTransportOptions = {}) {
    this.client = opts.client ?? new SlackClient(opts.botToken);
    this.appToken = opts.appToken ?? process.env.HERALD_SLACK_APP_TOKEN ?? "";
    this.makeSocket =
      opts.makeSocket ??
      ((appToken) => new SocketModeClient({ appToken }) as SocketModeEmitter);
  }

  async send(channel: string, text: string, threadId?: string): Promise<void> {
    await this.client.postMessage(channel, text, threadId);
  }

  async listen(handler: (msg: InboundMsg) => Promise<void>): Promise<void> {
    if (!this.appToken) {
      throw new Error("HERALD_SLACK_APP_TOKEN is not set");
    }
    const socket = this.makeSocket(this.appToken);
    socket.on("message", async ({ event, ack }) => {
      await ack();
      const msg = normalizeMessage(event);
      if (msg) await handler(msg);
    });
    await socket.start();
  }
}

/**
 * Normalize a raw Slack message event to InboundMsg, or null to ignore.
 * Bot messages and edits/deletes (any subtype) are dropped to avoid echo
 * loops and noise; messages missing a user/channel/ts are unprocessable.
 */
export function normalizeMessage(event: SlackMessageEvent): InboundMsg | null {
  if (event.bot_id || event.subtype) return null;
  if (!event.channel || !event.user || !event.ts) return null;
  return {
    channel: event.channel,
    text: event.text ?? "",
    sender: event.user,
    ts: event.ts,
    threadId: event.thread_ts,
  };
}
