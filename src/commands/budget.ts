import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { checkBudget } from "../budget/tracker.js";

export const budgetCommand = new Command("budget")
  .description("Show current usage vs pace cap")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const status = checkBudget(config.budget, config.journalDir);

    console.log(
      `Day ${status.dayOfWeek}/7 — ${status.usedTokens.toLocaleString()} / ${status.paceCap.toLocaleString()} tokens (${status.usedPct}% of ${status.weeklyLimit.toLocaleString()} weekly limit)`,
    );
    if (status.overPace) console.log("STATUS: OVER PACE — runs paused");
    else console.log("STATUS: OK");
  });
