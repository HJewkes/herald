import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { checkBudget } from "../budget/tracker.js";

export const budgetCommand = new Command("budget")
  .description("Show current usage vs limits")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action(async (opts) => {
    const config = loadConfig(opts.projectRoot);
    const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
    const status = await checkBudget(config.budget, apiKey);

    console.log(
      `Usage: $${status.usedUsd}/$${status.limitUsd} (${status.usedPct}%)`,
    );
    if (status.overHardCap) console.log("STATUS: OVER HARD CAP — runs blocked");
    else if (status.overWarning)
      console.log("STATUS: WARNING — approaching limit");
    else console.log("STATUS: OK");
  });
