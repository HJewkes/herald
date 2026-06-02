import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../core/config.js";
import { withAllowlist } from "../core/allowlist.js";
import { SlackTransport } from "../transports/slack.js";
import type { InboundHandler } from "../core/allowlist.js";
import type { Transport } from "../core/contract.js";

/**
 * M0 echo: send each inbound message's text back to its channel. No brain —
 * this proves the transport + allowlist + contract round-trip end to end.
 */
export function createEchoHandler(transport: Transport): InboundHandler {
  return async (msg) => {
    await transport.send(msg.channel, msg.text, msg.threadId);
  };
}

export const serveCommand = new Command("serve")
  .description("Run the inbound listener (M0: echo allowlisted messages back)")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action(async (opts) => {
    const config = loadConfig(opts.projectRoot);
    if (config.allowlist.length === 0) {
      console.error(
        "Warning: allowlist is empty — all inbound messages will be dropped. " +
          "Set `allowlist` (your Slack user ID) in herald.config.json.",
      );
    }

    const transport = new SlackTransport();
    const handler = withAllowlist(
      config.allowlist,
      createEchoHandler(transport),
    );

    await transport.listen(handler);
    console.log("Herald is listening (Socket Mode). Press Ctrl+C to stop.");
  });
