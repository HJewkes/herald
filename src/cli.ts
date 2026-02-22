#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "@commander-js/extra-typings";

function loadEnv(dir: string): void {
  try {
    const content = readFileSync(join(dir, ".env"), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env file — that's fine
  }
}
import { runCommand } from "./commands/run.js";
import { backlogCommand } from "./commands/backlog.js";
import { budgetCommand } from "./commands/budget.js";
import { journalCommand } from "./commands/journal.js";
import { notifyCommand } from "./commands/notify.js";
import { scheduleCommand } from "./commands/schedule.js";
import { configCommand } from "./commands/config.js";

// Load .env from project root (passed via --project-root) or cwd
const projectRootIdx = process.argv.indexOf("--project-root");
const projectRoot = projectRootIdx !== -1 && process.argv[projectRootIdx + 1]
  ? process.argv[projectRootIdx + 1]
  : process.cwd();
loadEnv(projectRoot);

const program = new Command()
  .name("herald")
  .description("Autonomous scheduled Claude Code agent")
  .version("0.1.0");

program.addCommand(runCommand);
program.addCommand(backlogCommand);
program.addCommand(budgetCommand);
program.addCommand(journalCommand);
program.addCommand(notifyCommand);
program.addCommand(scheduleCommand);
program.addCommand(configCommand);

program.parseAsync().catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});
