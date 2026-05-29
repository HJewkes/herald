/**
 * Structural shape the SDK driver needs to run a unit of work. Any caller
 * whose work-item has these fields (e.g. the backlog plugin's BacklogItem)
 * satisfies it — no import coupling to any plugin. The formal brain contract
 * is defined later in S3.
 */
export interface SdkRunInput {
  id: string;
  title: string;
  body: string;
  project?: string;
  allowedTools: string[];
}

export function buildPrompt(item: Pick<SdkRunInput, "title" | "body">): string {
  const lines = [
    `You are working on the following task autonomously.`,
    `Task: ${item.title}`,
    "",
    item.body,
    "",
    "Instructions:",
    "- Complete the task as described in the acceptance criteria.",
    "- Commit your work to a feature branch (never main/master).",
    "- If you cannot complete the task, explain what is blocking you.",
    "- If you need human input, clearly state the question.",
  ];

  return lines.join("\n");
}
