import { Command } from "@commander-js/extra-typings";
import { SlackClient } from "../notify/slack.js";

export const channelCommand = new Command("channel")
  .description("Manage Herald Slack channels");

channelCommand
  .command("create")
  .description("Create a Herald Slack channel")
  .argument("<project-name>", "Project name (channel will be #herald-<name>)")
  .option("--invite <user-id>", "Slack user ID to invite after creation")
  .action(async (projectName, opts) => {
    const channelName = `herald-${projectName}`;

    try {
      const client = new SlackClient();
      const channelId = await client.createChannel(channelName);
      console.log(`Created channel #${channelName} (${channelId})`);

      if (opts.invite) {
        await client.inviteToChannel(channelId, opts.invite);
        console.log(`Invited ${opts.invite} to #${channelName}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to create channel: ${msg}`);
      process.exitCode = 1;
    }
  });
