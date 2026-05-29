import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../core/config.js";

export const configCommand = new Command("config")
  .description("Show configuration")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    console.log(JSON.stringify(config, null, 2));
  });
