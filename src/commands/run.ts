import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { BacklogStore } from "../backlog/store.js";
import { selectTasks } from "../backlog/prioritizer.js";
import { checkBudget } from "../budget/tracker.js";
import { invokeClaudeCode } from "../runner/invoke.js";
import { sendIMessage, formatSummary } from "../notify/imessage.js";
import { writeEntry } from "../journal/logger.js";
import type { HeartbeatSummary, JournalEntry } from "../types.js";

export const runCommand = new Command("run")
  .description("Execute one heartbeat cycle")
  .option("--dry", "Show what would happen without executing")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action(async (opts) => {
    const config = loadConfig(opts.projectRoot);
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

    const budget = await checkBudget(config.budget, apiKey);

    if (budget.overHardCap) {
      console.log(
        `Budget exceeded: $${budget.usedUsd}/$${budget.limitUsd} (${budget.usedPct}%)`,
      );
      if (config.notify.imessage.recipient) {
        sendIMessage(
          config.notify.imessage.recipient,
          `Herald: Budget limit reached ($${budget.usedUsd}/$${budget.limitUsd}). Skipping run.`,
        );
      }
      return;
    }

    const store = new BacklogStore(config.backlogDir);
    const allItems = store.list();

    // Recover orphaned in-progress tasks from previous crashed runs
    for (const item of allItems) {
      if (item.status === 'in-progress') {
        console.log(`Recovering orphaned task: ${item.title} (${item.id})`);
        store.updateStatus(item.filePath, 'pending');
        item.status = 'pending';
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
        `\nBudget: $${budget.usedUsd}/$${budget.limitUsd} (${budget.usedPct}%)`,
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
        store.updateStatus(task.filePath, task.type === 'recurring' ? 'pending' : 'done');
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
      writeEntry(config.journalDir, entry);
    }

    if (config.notify.imessage.recipient) {
      const message = formatSummary(summary);
      sendIMessage(config.notify.imessage.recipient, message);
    }

    console.log("Heartbeat complete.");
  });
