import { Command } from "@commander-js/extra-typings";
import { BacklogStore } from "../plugins/backlog/store.js";
import { resolveBacklogDir } from "../plugins/backlog/config.js";

export const backlogCommand = new Command("backlog").description(
  "Manage backlog items",
);

backlogCommand
  .command("list")
  .description("Show current backlog sorted by priority")
  .option("--project-root <path>", "Herald project root", process.cwd())
  .action((opts) => {
    const store = new BacklogStore(resolveBacklogDir(opts.projectRoot));
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
