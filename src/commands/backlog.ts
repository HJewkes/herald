import { Command } from "@commander-js/extra-typings";
import { loadConfig } from "../config.js";
import { BacklogStore } from "../backlog/store.js";

export const backlogCommand = new Command("backlog").description(
  "Manage backlog items",
);

backlogCommand
  .command("list")
  .description("Show current backlog sorted by priority")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const store = new BacklogStore(config.backlogDir);
    const { items, warnings } = store.list();

    for (const w of warnings) {
      console.error(w);
    }

    if (items.length === 0) {
      console.log("Backlog is empty.");
      return;
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    for (const item of items) {
      const statusIcon = {
        pending: " ",
        "in-progress": ">",
        done: "x",
        blocked: "!",
      }[item.status];
      console.log(
        `[${statusIcon}] [${item.priority}] ${item.title} (${item.id})`,
      );
    }
  });
