import { describe, it, expect, vi } from "vitest";
import {
  SlackTransport,
  normalizeMessage,
  type SocketModeEmitter,
} from "../../src/transports/slack.js";
import type { SlackClient } from "../../src/transports/slack.js";
import type { InboundMsg } from "../../src/core/contract.js";

type Envelope = { event: Record<string, unknown>; ack: () => Promise<void> };

class FakeSocket implements SocketModeEmitter {
  started = false;
  ack = vi.fn().mockResolvedValue(undefined);
  private listener?: (e: Envelope) => void;

  on(event: string, listener: (e: Envelope) => void): this {
    if (event === "message") this.listener = listener;
    return this;
  }

  async start(): Promise<unknown> {
    this.started = true;
    return {};
  }

  async deliver(event: Record<string, unknown>): Promise<void> {
    await this.listener?.({ event, ack: this.ack });
  }
}

function fakeClient(): { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn().mockResolvedValue({ ts: "1", channel: "C1" }) };
}

describe("normalizeMessage", () => {
  it("maps a plain user message to InboundMsg", () => {
    expect(
      normalizeMessage({
        type: "message",
        channel: "C1",
        user: "U1",
        text: "had eggs",
        ts: "1.0",
        thread_ts: "0.9",
      }),
    ).toEqual<InboundMsg>({
      channel: "C1",
      text: "had eggs",
      sender: "U1",
      ts: "1.0",
      threadId: "0.9",
    });
  });

  it("ignores bot messages (avoids echo loops)", () => {
    expect(
      normalizeMessage({
        type: "message",
        channel: "C1",
        user: "U1",
        text: "x",
        ts: "1.0",
        bot_id: "B1",
      }),
    ).toBeNull();
  });

  it("ignores edits/deletes and other subtypes", () => {
    expect(
      normalizeMessage({
        type: "message",
        channel: "C1",
        user: "U1",
        ts: "1.0",
        subtype: "message_changed",
      }),
    ).toBeNull();
  });

  it("ignores messages missing user, channel, or ts", () => {
    expect(
      normalizeMessage({ type: "message", channel: "C1", ts: "1.0" }),
    ).toBeNull();
  });
});

describe("SlackTransport", () => {
  it("send delegates to SlackClient.postMessage", async () => {
    const client = fakeClient();
    const transport = new SlackTransport({
      client: client as unknown as SlackClient,
      appToken: "xapp-x",
    });

    await transport.send("C1", "hello", "2.0");

    expect(client.postMessage).toHaveBeenCalledWith("C1", "hello", "2.0");
  });

  it("listen starts the socket and dispatches normalized messages", async () => {
    const socket = new FakeSocket();
    const transport = new SlackTransport({
      client: fakeClient() as unknown as SlackClient,
      appToken: "xapp-x",
      makeSocket: () => socket,
    });
    const handler = vi.fn().mockResolvedValue(undefined);

    await transport.listen(handler);
    expect(socket.started).toBe(true);

    await socket.deliver({
      type: "message",
      channel: "C1",
      user: "U1",
      text: "had eggs",
      ts: "1.0",
    });

    expect(socket.ack).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      channel: "C1",
      text: "had eggs",
      sender: "U1",
      ts: "1.0",
      threadId: undefined,
    });
  });

  it("acks but does not dispatch bot messages", async () => {
    const socket = new FakeSocket();
    const transport = new SlackTransport({
      client: fakeClient() as unknown as SlackClient,
      appToken: "xapp-x",
      makeSocket: () => socket,
    });
    const handler = vi.fn().mockResolvedValue(undefined);

    await transport.listen(handler);
    await socket.deliver({
      type: "message",
      channel: "C1",
      user: "U1",
      text: "x",
      ts: "1.0",
      bot_id: "B1",
    });

    expect(socket.ack).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("listen throws when no app token is configured", async () => {
    const transport = new SlackTransport({
      client: fakeClient() as unknown as SlackClient,
      appToken: "",
    });

    await expect(transport.listen(vi.fn())).rejects.toThrow(
      "HERALD_SLACK_APP_TOKEN is not set",
    );
  });
});
