import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function sendIMessage(recipient: string, message: string): void {
  const escapedRecipient = escapeAppleScript(recipient);
  const escapedMessage = escapeAppleScript(message);

  const script = [
    'tell application "Messages"',
    "  set targetService to 1st account whose service type = iMessage",
    `  set targetBuddy to participant "${escapedRecipient}" of targetService`,
    `  send "${escapedMessage}" to targetBuddy`,
    "end tell",
  ].join("\n");

  const tmpFile = join(tmpdir(), `herald-imessage-${Date.now()}.scpt`);
  try {
    writeFileSync(tmpFile, script);
    execFileSync("osascript", [tmpFile], { timeout: 10000 });
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* cleanup best-effort */
    }
  }
}

function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}
