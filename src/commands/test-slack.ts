import { Command } from "@commander-js/extra-typings";
import { SlackClient } from "../transports/slack.js";
import { loadConfig } from "../core/config.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function resolveChannel(config: ReturnType<typeof loadConfig>): string {
  const raw = config.notify.slack.channel;
  if (!raw) throw new Error("No Slack channel configured in herald.config.json");
  return raw.replace(/^#/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countdown(seconds: number): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r  Waiting... ${i}s remaining `);
    await sleep(1000);
  }
  process.stdout.write("\r  Waiting... done!          \n");
}

function runStep(
  results: TestResult[],
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  return fn()
    .then(() => {
      results.push({ name, passed: true });
      console.log(`  ${name}... OK`);
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name, passed: false, error: msg });
      console.log(`  ${name}... FAILED: ${msg}`);
    });
}

function printSummary(results: TestResult[]): void {
  console.log("\n--- Permission Test Summary ---");
  const maxLen = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    const detail = r.error ? ` (${r.error})` : "";
    console.log(`  ${r.name.padEnd(maxLen)}  ${status}${detail}`);
  }
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n  ${passed}/${results.length} checks passed`);
}

export const testSlackCommand = new Command("test-slack")
  .description("Verify Slack bot permissions interactively")
  .option("--project-root <path>", "Project root directory", ".")
  .action(async (opts) => {
    const results: TestResult[] = [];
    const config = loadConfig(opts.projectRoot);
    const channel = resolveChannel(config);

    console.log("Creating Slack client...");
    const client = new SlackClient();

    console.log(`\nTesting Slack permissions for channel: ${channel}\n`);

    // Step 1: Auth test
    let botUserId = "";
    await runStep(results, "auth (auth.test)", async () => {
      const auth = await client.authTest();
      botUserId = auth.userId;
      console.log(`    Bot user ID: ${botUserId}`);
    });

    // Step 2: Post message
    let messageTs = "";
    let resolvedChannel = "";
    await runStep(results, "chat:write (chat.postMessage)", async () => {
      const text =
        ":test_tube: *Herald Permission Test*\n" +
        "Please do the following within 30 seconds:\n" +
        "1. React to this message with :+1:\n" +
        "2. Reply in this thread with the word `hello`";
      const result = await client.postMessage(channel, text);
      messageTs = result.ts;
      resolvedChannel = result.channel;
    });

    if (!messageTs) {
      console.log("\nCannot continue without a posted message. Aborting.");
      printSummary(results);
      process.exitCode = 1;
      return;
    }

    // Step 3: Wait for user interaction
    console.log("\n  Waiting 30s for you to react and reply...");
    await countdown(30);

    // Step 4: Read reactions
    await runStep(results, "reactions:read (reactions.get)", async () => {
      const reactions = await client.getReactions(resolvedChannel, messageTs);
      const thumbsUp = reactions.find(
        (r) => r.name === "+1" || r.name === "thumbsup",
      );
      if (!thumbsUp) {
        throw new Error("no :+1: reaction found on message");
      }
    });

    // Step 5: Read history
    await runStep(
      results,
      "channels:history (conversations.history)",
      async () => {
        const messages = await client.getHistory(resolvedChannel, messageTs);
        const helloMsg = messages.find((m) =>
          m.text.toLowerCase().includes("hello"),
        );
        if (!helloMsg) {
          console.log(
            '    Note: "hello" reply not found in channel history. ' +
              "Thread replies may not appear in conversations.history " +
              "(conversations.replies would be needed for full verification).",
          );
        }
      },
    );

    // Step 6: Update message
    await runStep(results, "chat:write (chat.update)", async () => {
      const updatedText =
        ":white_check_mark: *Herald Permission Test — Verified*\n" +
        "This message was updated by the test-slack command.";
      await client.updateMessage(resolvedChannel, messageTs, updatedText);
    });

    // Step 7: Upload file
    await runStep(results, "files:write (files.upload)", async () => {
      const content = [
        "Herald Slack Permission Test",
        `Timestamp: ${new Date().toISOString()}`,
        `Channel: ${resolvedChannel}`,
        `Bot User: ${botUserId}`,
        "Status: All permissions verified",
      ].join("\n");
      await client.uploadFile(
        resolvedChannel,
        content,
        "herald-test.txt",
        messageTs,
      );
    });

    // Summary
    printSummary(results);

    const anyFailed = results.some((r) => !r.passed);
    if (anyFailed) {
      process.exitCode = 1;
    }
  });
