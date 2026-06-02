import { describe, it, expect, vi } from "vitest";
import { createEchoHandler } from "../../src/commands/serve.js";
import { withAllowlist } from "../../src/core/allowlist.js";
import type { InboundMsg, Transport } from "../../src/core/contract.js";

function fakeTransport(): Transport & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(undefined),
  };
}

const msg = (sender: string): InboundMsg => ({
  channel: "C1",
  text: "had eggs",
  sender,
  ts: "1.0",
  threadId: "0.9",
});

describe("createEchoHandler", () => {
  it("echoes the message text back to its channel and thread", async () => {
    const transport = fakeTransport();
    await createEchoHandler(transport)(msg("U1"));

    expect(transport.send).toHaveBeenCalledWith("C1", "had eggs", "0.9");
  });

  it("composes with the allowlist: allowlisted echoes, others dropped", async () => {
    const transport = fakeTransport();
    const handler = withAllowlist(["U_OK"], createEchoHandler(transport));

    await handler(msg("U_EVIL"));
    expect(transport.send).not.toHaveBeenCalled();

    await handler(msg("U_OK"));
    expect(transport.send).toHaveBeenCalledOnce();
  });
});
