import { describe, it, expect, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server as HttpServer } from "node:http";
import {
  buildChannelNotification,
  createHttpListener,
  createReplyHub,
  parseReplyArgs,
  type ChannelEventInput,
} from "../../src/core/channel-server.js";

describe("buildChannelNotification", () => {
  it("maps an event to the claude/channel notification with identifier meta keys", () => {
    const input: ChannelEventInput = {
      content: "had eggs",
      channel: "diet",
      chat_id: "1700000000.0001",
      sender: "U123",
    };
    expect(buildChannelNotification(input)).toEqual({
      method: "notifications/claude/channel",
      params: {
        content: "had eggs",
        meta: { channel: "diet", chat_id: "1700000000.0001", sender: "U123" },
      },
    });
  });
});

describe("parseReplyArgs", () => {
  it("accepts a well-formed reply", () => {
    expect(parseReplyArgs({ chat_id: "c1", text: "logged ✅" })).toEqual({
      chat_id: "c1",
      text: "logged ✅",
    });
  });

  it("rejects missing or non-string fields", () => {
    expect(() => parseReplyArgs(null)).toThrow("must be an object");
    expect(() => parseReplyArgs({ text: "hi" })).toThrow("chat_id is required");
    expect(() => parseReplyArgs({ chat_id: "" })).toThrow("chat_id is required");
    expect(() => parseReplyArgs({ chat_id: "c1" })).toThrow("text is required");
  });
});

describe("createReplyHub", () => {
  it("delivers published replies to all subscribers until they unsubscribe", () => {
    const hub = createReplyHub();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const unsubA = hub.subscribe((r) => a.push(r));
    hub.subscribe((r) => b.push(r));
    expect(hub.size).toBe(2);

    hub.publish({ chat_id: "c1", text: "one" });
    unsubA();
    hub.publish({ chat_id: "c1", text: "two" });

    expect(a).toEqual([{ chat_id: "c1", text: "one" }]);
    expect(b).toEqual([
      { chat_id: "c1", text: "one" },
      { chat_id: "c1", text: "two" },
    ]);
    expect(hub.size).toBe(1);
  });
});

describe("createHttpListener", () => {
  let server: HttpServer | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    server = undefined;
  });

  async function listen(deps: Parameters<typeof createHttpListener>[0]) {
    server = createHttpListener(deps);
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  it("POST /event parses fields and forwards to pushEvent", async () => {
    const pushed: ChannelEventInput[] = [];
    const base = await listen({
      pushEvent: async (e) => void pushed.push(e),
      hub: createReplyHub(),
    });

    const res = await fetch(`${base}/event`, {
      method: "POST",
      body: JSON.stringify({
        content: "had eggs",
        channel: "diet",
        chat_id: "c1",
        sender: "U1",
      }),
    });

    expect(res.status).toBe(200);
    expect(pushed).toEqual([
      { content: "had eggs", channel: "diet", chat_id: "c1", sender: "U1" },
    ]);
  });

  it("POST /event rejects an event missing required fields", async () => {
    const base = await listen({
      pushEvent: async () => {
        throw new Error("should not be called");
      },
      hub: createReplyHub(),
    });

    const res = await fetch(`${base}/event`, {
      method: "POST",
      body: JSON.stringify({ content: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /replies streams published replies as SSE", async () => {
    const hub = createReplyHub();
    const base = await listen({ pushEvent: async () => {}, hub });

    const res = await fetch(`${base}/replies`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Wait until the GET handler has registered its subscriber, then publish.
    while (hub.size === 0) await new Promise((r) => setTimeout(r, 5));
    hub.publish({ chat_id: "c1", text: "logged ✅" });

    let buf = "";
    while (!buf.includes("data:")) {
      const { value } = await reader.read();
      buf += decoder.decode(value, { stream: true });
    }
    await reader.cancel();

    const dataLine = buf.split("\n").find((l) => l.startsWith("data:"))!;
    expect(JSON.parse(dataLine.slice("data:".length).trim())).toEqual({
      chat_id: "c1",
      text: "logged ✅",
    });
  });
});
