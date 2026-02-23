import type {
  BacklogItem,
  Priority,
  SlackCommand,
  SlackState,
  TaskStatus,
} from "../types.js";
import { BacklogStore, generateTaskId } from "../backlog/store.js";

const PRIORITY_VALUES: Priority[] = ["high", "medium", "low"];
const STATUS_VALUES: TaskStatus[] = [
  "pending",
  "in-progress",
  "done",
  "blocked",
];

const PRIORITY_ICON: Record<Priority, string> = {
  high: ":red_circle:",
  medium: ":large_yellow_circle:",
  low: ":white_circle:",
};

const STATUS_ICON: Record<TaskStatus, string> = {
  pending: ":hourglass_flowing_sand:",
  "in-progress": ":arrow_forward:",
  done: ":white_check_mark:",
  blocked: ":no_entry_sign:",
};

const HELP_TEXT = `*Herald commands*
• \`list\` — show pending/blocked tasks
• \`list --status pending|blocked|in-progress|done\`
• \`list --priority high|medium|low\`
• \`list --tag <tag>\`
• \`show <taskId>\` — show full task detail
• \`add <title>\` — create a new pending task
• \`add <title> --priority high|medium|low\`
• \`add <title> --tag tag1,tag2\`
• \`skip <taskId>\` — mark task done
• \`unblock <taskId>\` — set blocked task to pending
• \`priority <taskId> high|medium|low\` — change priority
• \`pause\` / \`resume\` — pause or resume Herald
• \`status\` — show backlog counts
• \`help\` — show this message`;

function extractFlag(text: string, flag: string): string | undefined {
  const match = text.match(new RegExp(`--${flag}(?:=|\\s+)(\\S+)`, "i"));
  return match?.[1];
}

function formatTaskLine(item: BacklogItem): string {
  return `${PRIORITY_ICON[item.priority]} ${STATUS_ICON[item.status]} \`${item.id}\` ${item.title}`;
}

function formatTaskDetail(item: BacklogItem): string {
  const lines = [
    `*${item.title}*  (\`${item.id}\`)`,
    `Status: ${item.status}  |  Priority: ${item.priority}  |  Type: ${item.type}`,
  ];
  if (item.tags.length > 0) lines.push(`Tags: ${item.tags.join(", ")}`);
  if (item.project) lines.push(`Project: \`${item.project}\``);
  if (item.body) {
    const truncated =
      item.body.length > 1500 ? item.body.slice(0, 1500) + "..." : item.body;
    lines.push("", "```", truncated, "```");
  }
  return lines.join("\n");
}

export function parseCommand(text: string): SlackCommand | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "pause") return { type: "pause" };
  if (lower === "resume") return { type: "resume" };
  if (lower === "status") return { type: "status" };
  if (lower === "help") return { type: "help" };

  const skipMatch = trimmed.match(/^skip\s+(\S+)$/i);
  if (skipMatch) return { type: "skip", taskId: skipMatch[1] };

  const unblockMatch = trimmed.match(/^unblock\s+(\S+)$/i);
  if (unblockMatch) return { type: "unblock", taskId: unblockMatch[1] };

  const priorityMatch = trimmed.match(
    /^priority\s+(\S+)\s+(high|medium|low)$/i,
  );
  if (
    priorityMatch &&
    PRIORITY_VALUES.includes(priorityMatch[2].toLowerCase() as Priority)
  ) {
    return {
      type: "priority",
      taskId: priorityMatch[1],
      priority: priorityMatch[2].toLowerCase() as Priority,
    };
  }

  if (/^list\b/i.test(trimmed)) {
    const status = extractFlag(trimmed, "status")?.toLowerCase() as
      | TaskStatus
      | undefined;
    const priority = extractFlag(trimmed, "priority")?.toLowerCase() as
      | Priority
      | undefined;
    const tag = extractFlag(trimmed, "tag");
    if (status && !STATUS_VALUES.includes(status)) return null;
    if (priority && !PRIORITY_VALUES.includes(priority)) return null;
    return { type: "list", status, priority, tag };
  }

  const showMatch = trimmed.match(/^show\s+(\S+)$/i);
  if (showMatch) return { type: "show", taskId: showMatch[1] };

  const addMatch = trimmed.match(/^add\s+(.+)$/i);
  if (addMatch) {
    const raw = addMatch[1];
    const title = raw.replace(/--\S+(?:=\S+|\s+\S+)/g, "").trim();
    const priority =
      (extractFlag(raw, "priority")?.toLowerCase() as Priority) ?? "medium";
    const tagStr = extractFlag(raw, "tag") ?? "";
    const tags = tagStr
      ? tagStr
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    if (!title) return null;
    if (!PRIORITY_VALUES.includes(priority)) return null;
    return { type: "add", title, priority, tags };
  }

  return null;
}

export function executeCommands(
  commands: SlackCommand[],
  store: BacklogStore,
  state: SlackState,
  backlogDir: string,
): string[] {
  const responses: string[] = [];
  const { items } = store.list();

  for (const cmd of commands) {
    switch (cmd.type) {
      case "pause":
        state.pauseRequested = true;
        responses.push(
          ':pause_button: Herald paused. Send "resume" to continue.',
        );
        break;

      case "resume":
        state.pauseRequested = false;
        responses.push(":arrow_forward: Herald resumed.");
        break;

      case "status": {
        const pending = items.filter((i) => i.status === "pending").length;
        const blocked = items.filter((i) => i.status === "blocked").length;
        const done = items.filter((i) => i.status === "done").length;
        const paused = state.pauseRequested ? " (paused)" : "";
        responses.push(
          `:clipboard: Backlog${paused}: ${pending} pending, ${blocked} blocked, ${done} done`,
        );
        break;
      }

      case "skip": {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else {
          store.updateStatus(item.filePath, "done");
          responses.push(`:fast_forward: Skipped "${item.title}".`);
        }
        break;
      }

      case "unblock": {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else if (item.status !== "blocked") {
          responses.push(
            `:warning: "${item.title}" is not blocked (status: ${item.status}).`,
          );
        } else {
          store.updateStatus(item.filePath, "pending");
          responses.push(`:white_check_mark: Unblocked "${item.title}".`);
        }
        break;
      }

      case "priority": {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else {
          store.updatePriority(item.filePath, cmd.priority);
          responses.push(
            `:arrow_up_down: Set "${item.title}" priority to ${cmd.priority}.`,
          );
        }
        break;
      }

      case "list": {
        let visible = cmd.status
          ? items
          : items.filter((i) => i.status !== "done");
        if (cmd.status)
          visible = visible.filter((i) => i.status === cmd.status);
        if (cmd.priority)
          visible = visible.filter((i) => i.priority === cmd.priority);
        if (cmd.tag) visible = visible.filter((i) => i.tags.includes(cmd.tag!));

        if (visible.length === 0) {
          responses.push(":inbox_tray: No matching tasks.");
          break;
        }

        const priorityOrder: Record<Priority, number> = {
          high: 0,
          medium: 1,
          low: 2,
        };
        visible.sort(
          (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
        );

        const lines = visible.map((i) => formatTaskLine(i));
        responses.push(
          `:clipboard: *Backlog (${visible.length})*\n${lines.join("\n")}`,
        );
        break;
      }

      case "show": {
        const item = items.find((i) => i.id === cmd.taskId);
        if (!item) {
          responses.push(`:warning: Task "${cmd.taskId}" not found.`);
        } else {
          responses.push(formatTaskDetail(item));
        }
        break;
      }

      case "add": {
        const now = new Date();
        const id = generateTaskId(backlogDir, now);
        try {
          store.create({
            id,
            title: cmd.title,
            priority: cmd.priority,
            tags: cmd.tags,
            created: now.toISOString().slice(0, 10),
          });
          responses.push(
            `:memo: Created *${cmd.title}* (\`${id}\`) as ${cmd.priority} priority.`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          responses.push(`:warning: Failed to create task: ${msg}`);
        }
        break;
      }

      case "help":
        responses.push(HELP_TEXT);
        break;
    }
  }

  return responses;
}
