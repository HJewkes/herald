import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { sendIMessage } from "../notify/imessage.js";

export const notifyCommand = new Command("notify").description(
  "Notification management",
);

notifyCommand
  .command("test")
  .description("Send a test iMessage")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const recipient = config.notify.imessage.recipient;

    if (!recipient) {
      console.error(
        "No iMessage recipient configured. Set notify.imessage.recipient in herald.config.json",
      );
      process.exitCode = 1;
      return;
    }

    sendIMessage(
      recipient,
      "Herald test message. If you see this, notifications are working.",
    );
    console.log(`Test message sent to ${recipient}`);
  });
