import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { BacklogStore } from "../backlog/store.js";
import { selectTasks } from "../backlog/prioritizer.js";
import { checkBudget } from "../budget/tracker.js";
import { invokeClaudeCode } from "../runner/invoke.js";
import { sendSlack, formatSummary } from "../notify/slack.js";
import { writeEntry } from "../journal/logger.js";
import { acquireLock, releaseLock } from "../lockfile.js";
import type { HeartbeatSummary, JournalEntry } from "../types.js";

async function notify(channel: string | undefined, text: string): Promise<void> {
  if (!channel) return;
  try {
    await sendSlack(channel, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to send Slack notification: ${msg}`);
  }
}

export const runCommand = new Command("run")
  .description("Execute one heartbeat cycle")
  .option("--dry", "Show what would happen without executing")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action(async (opts) => {
    let config: ReturnType<typeof loadConfig> | undefined;
    try {
      config = loadConfig(opts.projectRoot);

      if (!opts.dry) {
        if (!acquireLock(opts.projectRoot)) {
          console.log("Another herald run is in progress. Skipping.");
          return;
        }
      }

      try {
        const budget = checkBudget(config.budget, config.journalDir);
        const channel = config.notify.slack.channel;

        if (budget.overPace) {
          console.log(
            `Over pace: ${budget.usedTokens.toLocaleString()}/${budget.paceCap.toLocaleString()} tokens (day ${budget.dayOfWeek}/7, ${budget.usedPct}% of weekly limit)`,
          );
          await notify(
            channel,
            `:pause_button: Over pace (${budget.usedPct}% used, cap ${budget.paceCapPct}% for day ${budget.dayOfWeek}). Skipping run.`,
          );
          return;
        }

        const store = new BacklogStore(config.backlogDir);
        const { items: allItems, warnings: backlogWarnings } = store.list();
        for (const w of backlogWarnings) {
          console.error(w);
        }

        for (const item of allItems) {
          if (item.status === "in-progress") {
            console.log(`Recovering orphaned task: ${item.title} (${item.id})`);
            try {
              store.updateStatus(item.filePath, "pending");
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

        for (const task of selected) {
          console.log(`Executing: ${task.title} (${task.id})`);
          store.updateStatus(task.filePath, "in-progress");

          const startTime = Date.now();
          const maxTurns = Math.floor(task.maxTokens / 5000);
          const result = invokeClaudeCode(task, Math.max(maxTurns, 5));
          const durationMs = Date.now() - startTime;

          if (result.success) {
            store.updateStatus(
              task.filePath,
              task.type === "recurring" ? "pending" : "done",
            );
            store.updateLastRun(task.filePath, new Date().toISOString());
            summary.tasksCompleted.push(task.title);
          } else {
            store.updateStatus(task.filePath, "blocked");
            summary.tasksBlocked.push(task.title);
          }

          if (result.needsInput) {
            summary.needsInput.push(result.needsInput);
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
            console.error(
              `Failed to write journal entry for ${task.id}: ${msg}`,
            );
          }
        }

        if (channel) {
          await notify(channel, formatSummary(summary));
        }

        console.log("Heartbeat complete.");
      } finally {
        if (!opts.dry) {
          releaseLock(opts.projectRoot);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Herald run crashed: ${msg}`);
      await notify(
        config?.notify?.slack?.channel,
        `:rotating_light: *Herald CRASH:* ${msg}`,
      );
      process.exitCode = 1;
    }
  });
