import { describe, it, expect } from "vitest";
import {
  ChannelDriver,
  decodeChatId,
  encodeChatId,
} from "../../src/drivers/channel.js";
import type { BrainEvent, InboundMsg, Plugin } from "../../src/core/contract.js";

const PLUGIN = {} as Plugin;

function fakeTransport() {
  const sent: Array<{ channel: string; text: string; threadId?: string }> = [];
  return {
    sent,
    async send(channel: string, text: string, threadId?: string) {
      sent.push({ channel, text, threadId });
    },
    async listen(_h: (m: InboundMsg) => Promise<void>) {},
  };
}

describe("encode/decodeChatId", () => {
  it("round-trips a channel with and without a thread", () => {
    expect(decodeChatId(encodeChatId("C1"))).toEqual({ physicalChannel: "C1" });
    expect(decodeChatId(encodeChatId("C1", "170.1"))).toEqual({
      physicalChannel: "C1",
      threadId: "170.1",
    });
  });
});

describe("ChannelDriver.handle", () => {
  it("POSTs the resolved event to the loopback /event endpoint", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const driver = new ChannelDriver({
      transport: fakeTransport(),
      loopbackUrl: "http://127.0.0.1:8799/",
      resolveChannel: (logical) => (logical === "diet" ? "C_DIET" : logical),
      fetchImpl,
    });

    const event: BrainEvent = {
      kind: "message",
      text: "had eggs",
      sender: "U1",
      threadId: "170.1",
    };
    await driver.handle("diet", event, PLUGIN);

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:8799/event",
        body: {
          content: "had eggs",
          channel: "diet",
          chat_id: "C_DIET:170.1",
          sender: "U1",
        },
      },
    ]);
  });

  it("throws when the loopback rejects the event", async () => {
    const fetchImpl = (async () =>
      new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const driver = new ChannelDriver({
      transport: fakeTransport(),
      loopbackUrl: "http://127.0.0.1:8799",
      resolveChannel: (l) => l,
      fetchImpl,
    });

    await expect(
      driver.handle(
        "diet",
        { kind: "scheduled", jobId: "j1", prompt: "nag" },
        PLUGIN,
      ),
    ).rejects.toThrow("channel loopback rejected event: 500");
  });
});

describe("ChannelDriver.deliverReply", () => {
  it("routes a reply back through the transport with the decoded thread", async () => {
    const transport = fakeTransport();
    const driver = new ChannelDriver({
      transport,
      loopbackUrl: "http://127.0.0.1:8799",
      resolveChannel: (l) => l,
    });

    await driver.deliverReply({ chat_id: "C_DIET:170.1", text: "logged ✅" });
    await driver.deliverReply({ chat_id: "C_DIET", text: "top-level" });

    expect(transport.sent).toEqual([
      { channel: "C_DIET", text: "logged ✅", threadId: "170.1" },
      { channel: "C_DIET", text: "top-level", threadId: undefined },
    ]);
  });
});
