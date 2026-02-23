import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { sendSlack } from "../notify/slack.js";

export const notifyCommand = new Command("notify").description(
  "Notification management",
);

notifyCommand
  .command("test")
  .description("Send a test Slack message")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action(async (opts) => {
    const config = loadConfig(opts.projectRoot);
    const channel = config.notify.slack.channel;

    if (!channel) {
      console.error(
        "No Slack channel configured. Set notify.slack.channel in herald.config.json",
      );
      process.exitCode = 1;
      return;
    }

    await sendSlack(
      channel,
      "Herald test message. If you see this, notifications are working. :wave:",
    );
    console.log(`Test message sent to ${channel}`);
  });
