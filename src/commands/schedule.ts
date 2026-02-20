import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import {
  installSchedule,
  uninstallSchedule,
  getScheduleStatus,
} from "../scheduler.js";

export const scheduleCommand = new Command("schedule").description(
  "Manage launchd schedule",
);

scheduleCommand
  .command("install")
  .description("Generate and load launchd plist")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    installSchedule(config.schedule, opts.projectRoot);
    console.log("Schedule installed.");
  });

scheduleCommand
  .command("uninstall")
  .description("Remove launchd plist")
  .action(() => {
    uninstallSchedule();
    console.log("Schedule removed.");
  });

scheduleCommand
  .command("status")
  .description("Show schedule status")
  .action(() => {
    const status = getScheduleStatus();
    console.log(status);
  });
