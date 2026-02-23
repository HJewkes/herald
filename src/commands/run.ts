import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { BacklogStore } from "../backlog/store.js";
import { selectTasks } from "../backlog/prioritizer.js";
import { checkBudget } from "../budget/tracker.js";
import { invokeClaudeCode } from "../runner/invoke.js";
import { SlackClient, formatSummary } from "../notify/slack.js";
import { writeEntry } from "../journal/logger.js";
import { acquireLock, releaseLock } from "../lockfile.js";
import { loadSlackState, saveSlackState, trackMessage } from "../slack/state.js";
import { parseCommand, executeCommands } from "../slack/commands.js";
import type {
  BacklogItem,
  HeartbeatSummary,
  JournalEntry,
  RunResult,
  SlackState,
} from "../types.js";

function tryCreateClient(): SlackClient | null {
  try {
    return new SlackClient();
  } catch {
    return null;
  }
}

async function tryNotify(
  client: SlackClient | null,
  channel: string | undefined,
  text: string,
): Promise<void> {
  if (!client || !channel) return;
  try {
    await client.postMessage(channel, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to send Slack notification: ${msg}`);
  }
}

export async function processInboundCommands(
  client: SlackClient,
  channel: string,
  store: BacklogStore,
  state: SlackState,
  botUserId: string,
  backlogDir: string,
): Promise<string[]> {
  const messages = await client.getHistory(channel, state.lastCheckedTs);

  if (messages.length > 0) {
    const latest = messages.reduce((a, b) => (a.ts > b.ts ? a : b));
    state.lastCheckedTs = latest.ts;
  }

  const userMessages = messages.filter((m) => m.user !== botUserId);
  const commands = userMessages
    .map((m) => parseCommand(m.text))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return executeCommands(commands, store, state, backlogDir);
}

export async function processReactions(
  client: SlackClient,
  channel: string,
  state: SlackState,
  store: BacklogStore,
): Promise<void> {
  for (const [taskId, ts] of Object.entries(state.messageMap)) {
    try {
      const reactions = await client.getReactions(channel, ts);
      const names = new Set(reactions.map((r) => r.name));

      if (names.has('+1') || names.has('thumbsup')) {
        const { items } = store.list();
        const item = items.find((i) => i.id === taskId);
        if (item?.status === 'blocked') {
          store.updateStatus(item.filePath, 'pending');
        }
      }

      if (names.has('pause_button') || names.has('double_vertical_bar')) {
        state.pauseRequested = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to check reactions for ${taskId}: ${msg}`);
    }
  }
}

export async function postRunProgress(
  client: SlackClient,
  channel: string,
  task: BacklogItem,
  result: RunResult,
  runMessageTs: string,
  state: SlackState,
): Promise<void> {
  const icon = result.success ? ':white_check_mark:' : ':x:';
  const status = result.success ? 'completed' : 'failed';
  const text = `${icon} *${task.title}* — ${status}`;

  try {
    const reply = await client.postMessage(channel, text, runMessageTs);
    trackMessage(state, task.id, reply.ts);

    if (result.output.length > 500) {
      await client.uploadFile(channel, result.output, `${task.id}-output.txt`, runMessageTs);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to post progress for ${task.id}: ${msg}`);
  }
}

async function handleSlackInbound(
  client: SlackClient | null,
  channel: string,
  backlogStore: BacklogStore,
  state: SlackState,
  backlogDir: string,
): Promise<void> {
  let botUserId = '';
  if (client) {
    try {
      const auth = await client.authTest();
      botUserId = auth.userId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Slack auth test failed: ${msg}`);
    }
  }

  if (client && channel) {
    try {
      const responses = await processInboundCommands(
        client, channel, backlogStore, state, botUserId, backlogDir,
      );
      for (const r of responses) {
        await tryNotify(client, channel, r);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to process inbound commands: ${msg}`);
    }

    try {
      await processReactions(client, channel, state, backlogStore);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to process reactions: ${msg}`);
    }
  }
}

async function executeTaskLoop(
  selected: BacklogItem[],
  backlogStore: BacklogStore,
  config: ReturnType<typeof loadConfig>,
  summary: HeartbeatSummary,
  client: SlackClient | null,
  channel: string,
  runMessageTs: string,
  state: SlackState,
): Promise<void> {
  for (const task of selected) {
    console.log(`Executing: ${task.title} (${task.id})`);
    backlogStore.updateStatus(task.filePath, "in-progress");

    const startTime = Date.now();
    const maxTurns = Math.floor(task.maxTokens / 5000);
    const result = invokeClaudeCode(task, Math.max(maxTurns, 5));
    const durationMs = Date.now() - startTime;

    if (result.success) {
      backlogStore.updateStatus(
        task.filePath,
        task.type === "recurring" ? "pending" : "done",
      );
      backlogStore.updateLastRun(task.filePath, new Date().toISOString());
      summary.tasksCompleted.push(task.title);
    } else {
      backlogStore.updateStatus(task.filePath, "blocked");
      summary.tasksBlocked.push(task.title);
    }

    if (result.needsInput) {
      summary.needsInput.push(result.needsInput);
    }

    if (client && channel && runMessageTs) {
      await postRunProgress(client, channel, task, result, runMessageTs, state);
    }

    const entry: JournalEntry = {
      timestamp: new Date().toISOString(),
      taskId: task.id,
      taskTitle: task.title,
      status: result.success ? "success" : "failure",
      durationMs,
      tokensUsed: result.tokensUsed,
      costUsd: result.costUsd,
      output: result.output.slice(0, 2000),
    };
    try {
      writeEntry(config.journalDir, entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to write journal entry for ${task.id}: ${msg}`);
    }
  }
}

export const runCommand = new Command("run")
  .description("Execute one heartbeat cycle")
  .option("--dry", "Show what would happen without executing")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action(async (opts) => {
    let config: ReturnType<typeof loadConfig> | undefined;
    let client: SlackClient | null = null;

    try {
      config = loadConfig(opts.projectRoot);
      client = tryCreateClient();
      const channel = config.notify.slack.channel;
      const state = loadSlackState(opts.projectRoot);
      const backlogStore = new BacklogStore(config.backlogDir);

      await handleSlackInbound(client, channel, backlogStore, state, config.backlogDir);

      if (state.pauseRequested) {
        console.log("Herald is paused. Send 'resume' in Slack to continue.");
        await tryNotify(client, channel, ':pause_button: Herald is paused.');
        saveSlackState(opts.projectRoot, state);
        return;
      }

      saveSlackState(opts.projectRoot, state);

      let lockAcquired = false;
      if (!opts.dry) {
        if (!acquireLock(opts.projectRoot)) {
          console.log("Another herald run is in progress. Skipping.");
          return;
        }
        lockAcquired = true;
      }

      try {
        const budget = checkBudget(config.budget, config.journalDir);

        if (budget.overPace) {
          console.log(
            `Over pace: ${budget.usedTokens.toLocaleString()}/${budget.paceCap.toLocaleString()} tokens (day ${budget.dayOfWeek}/7, ${budget.usedPct}% of weekly limit)`,
          );
          await tryNotify(
            client,
            channel,
            `:pause_button: Over pace (${budget.usedPct}% used, cap ${budget.paceCapPct}% for day ${budget.dayOfWeek}). Skipping run.`,
          );
          return;
        }

        const { items: allItems, warnings: backlogWarnings } = backlogStore.list();
        for (const w of backlogWarnings) {
          console.error(w);
        }

        for (const item of allItems) {
          if (item.status === "in-progress") {
            console.log(`Recovering orphaned task: ${item.title} (${item.id})`);
            try {
              backlogStore.updateStatus(item.filePath, "pending");
              item.status = "pending";
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Failed to recover task ${item.id}: ${msg}`);
            }
          }
        }

        const selected = selectTasks(allItems, budget);

        const summary: HeartbeatSummary = {
          timestamp: new Date().toISOString(),
          tasksCompleted: [],
          tasksSkipped: [],
          tasksBlocked: [],
          needsInput: [],
          budget,
        };

        if (selected.length === 0) {
          console.log("No tasks eligible for execution.");
          summary.tasksSkipped = allItems
            .filter((i) => i.status === "pending")
            .map((i) => i.title);
        }

        if (opts.dry) {
          console.log("DRY RUN — would execute:");
          for (const task of selected) {
            console.log(`  [${task.priority}] ${task.title} (${task.id})`);
          }
          console.log(
            `\nBudget: ${budget.usedTokens.toLocaleString()}/${budget.paceCap.toLocaleString()} tokens (day ${budget.dayOfWeek}/7, ${budget.usedPct}% of weekly limit)`,
          );
          return;
        }

        let runMessageTs = '';
        if (client && channel && selected.length > 0) {
          try {
            const taskList = selected.map((t) => `• ${t.title}`).join('\n');
            const startMsg = `:robot_face: *Herald starting run*\n${taskList}`;
            const posted = await client.postMessage(channel, startMsg);
            runMessageTs = posted.ts;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Failed to post start message: ${msg}`);
          }
        }

        await executeTaskLoop(
          selected, backlogStore, config, summary,
          client, channel, runMessageTs, state,
        );

        if (client && channel && runMessageTs) {
          try {
            await client.updateMessage(channel, runMessageTs, formatSummary(summary));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Failed to update run message: ${msg}`);
          }
        } else if (channel) {
          await tryNotify(client, channel, formatSummary(summary));
        }

        saveSlackState(opts.projectRoot, state);
        console.log("Heartbeat complete.");
      } finally {
        if (lockAcquired) {
          releaseLock(opts.projectRoot);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Herald run crashed: ${msg}`);
      await tryNotify(
        client,
        config?.notify?.slack?.channel,
        `:rotating_light: *Herald CRASH:* ${msg}`,
      );
      process.exitCode = 1;
    }
  });
