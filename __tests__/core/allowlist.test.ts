import { describe, it, expect, vi } from "vitest";
import { withAllowlist } from "../../src/core/allowlist.js";
import type { InboundMsg } from "../../src/core/contract.js";

const msg = (sender: string): InboundMsg => ({
  channel: "C1",
  text: "hi",
  sender,
  ts: "1.0",
});

describe("withAllowlist", () => {
  it("passes through messages from allowlisted senders", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = withAllowlist(["U_OK"], handler);

    await wrapped(msg("U_OK"));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg("U_OK"));
  });

  it("drops messages from senders not on the allowlist", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = withAllowlist(["U_OK"], handler);

    await wrapped(msg("U_EVIL"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed: an empty allowlist drops everything", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = withAllowlist([], handler);

    await wrapped(msg("U_OK"));

    expect(handler).not.toHaveBeenCalled();
  });
});
