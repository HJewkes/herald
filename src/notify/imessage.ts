import { execSync } from 'node:child_process';
import type { HeartbeatSummary } from '../types.js';

export function sendIMessage(recipient: string, message: string): void {
  const escaped = message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${recipient}" of targetService
      send "${escaped}" to targetBuddy
    end tell
  `;

  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    timeout: 10000,
  });
}

export function formatSummary(summary: HeartbeatSummary): string {
  const date = new Date(summary.timestamp);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
  const lines: string[] = [`Herald Report (${dateStr})`];

  if (summary.tasksCompleted.length > 0) {
    lines.push('', 'Completed:');
    for (const t of summary.tasksCompleted) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.tasksSkipped.length > 0) {
    lines.push('', 'Skipped:');
    for (const t of summary.tasksSkipped) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.tasksBlocked.length > 0) {
    lines.push('', 'Blocked:');
    for (const t of summary.tasksBlocked) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.needsInput.length > 0) {
    lines.push('', 'Needs input:');
    for (const t of summary.needsInput) {
      lines.push(`- ${t}`);
    }
  }

  if (
    summary.tasksCompleted.length === 0 &&
    summary.tasksSkipped.length === 0 &&
    summary.tasksBlocked.length === 0
  ) {
    lines.push('', 'No tasks to process.');
  }

  const { usedUsd, limitUsd, usedPct } = summary.budget;
  lines.push('', `Budget: $${usedUsd}/$${limitUsd} (${usedPct}%)`);

  return lines.join('\n');
}
