import type { HeartbeatSummary } from "./types.js";

export function formatSlackSummary(summary: HeartbeatSummary): string {
  const date = new Date(summary.timestamp);
  const dateStr = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  const lines: string[] = [`*Herald Report (${dateStr})*`];

  if (summary.tasksCompleted.length > 0) {
    lines.push("", ":white_check_mark: *Completed:*");
    for (const t of summary.tasksCompleted) {
      lines.push(`• ${t}`);
    }
  }

  if (summary.tasksSkipped.length > 0) {
    lines.push("", ":fast_forward: *Skipped:*");
    for (const t of summary.tasksSkipped) {
      lines.push(`• ${t}`);
    }
  }

  if (summary.tasksBlocked.length > 0) {
    lines.push("", ":no_entry_sign: *Blocked:*");
    for (const t of summary.tasksBlocked) {
      lines.push(`• ${t}`);
    }
  }

  if (summary.needsInput.length > 0) {
    lines.push("", ":question: *Needs input:*");
    for (const t of summary.needsInput) {
      lines.push(`• ${t}`);
    }
  }

  if (
    summary.tasksCompleted.length === 0 &&
    summary.tasksSkipped.length === 0 &&
    summary.tasksBlocked.length === 0 &&
    summary.needsInput.length === 0
  ) {
    lines.push("", "No tasks to process.");
  }

  const { usedTokens, paceCap, usedPct, dayOfWeek } = summary.budget;
  lines.push(
    "",
    `_Pace: ${usedTokens.toLocaleString()}/${paceCap.toLocaleString()} tokens (day ${dayOfWeek}/7, ${usedPct}% weekly)_`,
  );

  return lines.join("\n");
}

export function formatIMessageSummary(summary: HeartbeatSummary): string {
  const date = new Date(summary.timestamp);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
  const lines: string[] = [`Herald Report (${dateStr})`];

  if (summary.tasksCompleted.length > 0) {
    lines.push("", "Completed:");
    for (const t of summary.tasksCompleted) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.tasksSkipped.length > 0) {
    lines.push("", "Skipped:");
    for (const t of summary.tasksSkipped) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.tasksBlocked.length > 0) {
    lines.push("", "Blocked:");
    for (const t of summary.tasksBlocked) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.needsInput.length > 0) {
    lines.push("", "Needs input:");
    for (const t of summary.needsInput) {
      lines.push(`- ${t}`);
    }
  }

  if (
    summary.tasksCompleted.length === 0 &&
    summary.tasksSkipped.length === 0 &&
    summary.tasksBlocked.length === 0
  ) {
    lines.push("", "No tasks to process.");
  }

  const { usedTokens, paceCap, usedPct, dayOfWeek } = summary.budget;
  lines.push(
    "",
    `Pace: ${usedTokens.toLocaleString()}/${paceCap.toLocaleString()} tokens (day ${dayOfWeek}/7, ${usedPct}% weekly)`,
  );

  return lines.join("\n");
}
