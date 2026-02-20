import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HeartbeatSummary } from '../types.js';

export function sendIMessage(recipient: string, message: string): void {
  const escapedRecipient = escapeAppleScript(recipient);
  const escapedMessage = escapeAppleScript(message);

  const script = [
    'tell application "Messages"',
    '  set targetService to 1st account whose service type = iMessage',
    `  set targetBuddy to participant "${escapedRecipient}" of targetService`,
    `  send "${escapedMessage}" to targetBuddy`,
    'end tell',
  ].join('\n');

  const tmpFile = join(tmpdir(), `herald-imessage-${Date.now()}.scpt`);
  try {
    writeFileSync(tmpFile, script);
    execFileSync('osascript', [tmpFile], { timeout: 10000 });
  } finally {
    try { unlinkSync(tmpFile); } catch { /* cleanup best-effort */ }
  }
}

function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
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

  const { usedTokens, paceCap, usedPct, dayOfWeek } = summary.budget;
  lines.push('', `Pace: ${usedTokens.toLocaleString()}/${paceCap.toLocaleString()} tokens (day ${dayOfWeek}/7, ${usedPct}% weekly)`);

  return lines.join('\n');
}
