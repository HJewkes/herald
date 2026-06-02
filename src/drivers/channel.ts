import type {
  BrainDriver,
  BrainEvent,
  Plugin,
  Transport,
} from "../core/contract.js";
import type { Reply } from "../core/channel-server.js";

/**
 * The subscription-cheap driver: pushes events into a persistent interactive
 * Claude Code session through the loopback channel server, and forwards Claude's
 * replies back out through the transport. See
 * docs/plans/2026-06-02-channeldriver-design.md.
 *
 * `handle()` is fire-and-forget — it POSTs the event and returns. Replies arrive
 * asynchronously on the loopback's SSE stream; `startReplyPump()` consumes them
 * and routes each to `transport.send()` using the chat_id correlation.
 */
export interface ChannelDriverOptions {
  transport: Transport;
  /** Base URL of the loopback channel server, e.g. "http://127.0.0.1:8799". */
  loopbackUrl: string;
  /** Map a logical channel (e.g. "diet") to the physical channel the transport sends to. */
  resolveChannel(logical: string): string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Encode the reply target into the chat_id Claude echoes back. Slack channel ids
 * ("C0123") never contain ":", so a single ":" cleanly separates an optional
 * thread id. Stateless, so it survives a session/host restart.
 */
export function encodeChatId(physicalChannel: string, threadId?: string): string {
  return threadId ? `${physicalChannel}:${threadId}` : physicalChannel;
}

export function decodeChatId(chatId: string): {
  physicalChannel: string;
  threadId?: string;
} {
  const idx = chatId.indexOf(":");
  if (idx === -1) return { physicalChannel: chatId };
  return {
    physicalChannel: chatId.slice(0, idx),
    threadId: chatId.slice(idx + 1) || undefined,
  };
}

function eventText(event: BrainEvent): string {
  return event.kind === "message" ? event.text : event.prompt;
}

function eventSender(event: BrainEvent): string {
  return event.kind === "message" ? event.sender : "scheduler";
}

function eventThreadId(event: BrainEvent): string | undefined {
  return event.kind === "message" ? event.threadId : undefined;
}

export class ChannelDriver implements BrainDriver {
  private readonly transport: Transport;
  private readonly loopbackUrl: string;
  private readonly resolveChannel: (logical: string) => string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ChannelDriverOptions) {
    this.transport = opts.transport;
    this.loopbackUrl = opts.loopbackUrl.replace(/\/$/, "");
    this.resolveChannel = opts.resolveChannel;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async handle(
    channel: string,
    event: BrainEvent,
    _plugin: Plugin,
  ): Promise<void> {
    const physical = this.resolveChannel(channel);
    const body = {
      content: eventText(event),
      channel,
      chat_id: encodeChatId(physical, eventThreadId(event)),
      sender: eventSender(event),
    };
    const res = await this.fetchImpl(`${this.loopbackUrl}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(
        `channel loopback rejected event: ${res.status} ${await res.text()}`,
      );
    }
  }

  /** Route one reply from Claude back out through the transport. */
  async deliverReply(reply: Reply): Promise<void> {
    const { physicalChannel, threadId } = decodeChatId(reply.chat_id);
    await this.transport.send(physicalChannel, reply.text, threadId);
  }

  /**
   * Long-lived: subscribe to the loopback SSE reply stream and deliver each
   * reply. Resolves only when the stream ends; run it un-awaited alongside the
   * transport listener.
   */
  async startReplyPump(signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(`${this.loopbackUrl}/replies`, { signal });
    if (!res.body) throw new Error("reply stream had no body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const json = line.slice("data:".length).trim();
        if (!json) continue;
        await this.deliverReply(JSON.parse(json) as Reply);
      }
    }
  }
}
