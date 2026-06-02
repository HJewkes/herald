import type { InboundMsg } from "./contract.js";

export type InboundHandler = (msg: InboundMsg) => Promise<void>;

/**
 * Sender allowlist (defense-in-depth, per v0 plan §8). Wraps an inbound
 * handler so messages from senders not on the allowlist are dropped before
 * any downstream processing — the model never sees their text. An empty
 * allowlist drops everything (fail closed).
 */
export function withAllowlist(
  allowed: string[],
  handler: InboundHandler,
): InboundHandler {
  const set = new Set(allowed);
  return async (msg) => {
    if (!set.has(msg.sender)) return;
    await handler(msg);
  };
}
