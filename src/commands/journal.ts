import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { readEntries } from "../journal/logger.js";

export const journalCommand = new Command("journal")
  .description("Show recent run history")
  .option("--limit <n>", "Number of entries to show", "10")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const entries = readEntries(config.journalDir, parseInt(opts.limit, 10));

    if (entries.length === 0) {
      console.log("No journal entries.");
      return;
    }

    for (const entry of entries) {
      const date = new Date(entry.timestamp).toLocaleString();
      const cost = entry.costUsd ? ` ($${entry.costUsd.toFixed(3)})` : "";
      console.log(`[${date}] ${entry.status}: ${entry.taskTitle}${cost}`);
    }
  });
