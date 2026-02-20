#!/usr/bin/env node
import { Command } from "@commander-js/extra-typings";
import { runCommand } from "./commands/run.js";
import { backlogCommand } from "./commands/backlog.js";
import { budgetCommand } from "./commands/budget.js";
import { journalCommand } from "./commands/journal.js";
import { notifyCommand } from "./commands/notify.js";
import { scheduleCommand } from "./commands/schedule.js";
import { configCommand } from "./commands/config.js";

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
