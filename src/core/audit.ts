import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Harness-level tool-call auditing. Claude Code's PreToolUse hook invokes
 * `herald hook pretooluse`, which appends one line per tool call to an
 * append-only log. M1 is audit-only — it never blocks a call; allowlist-deny
 * (exit 2 for tools outside the plugin's allowedTools) is a fast follow.
 */

/** The subset of Claude Code's PreToolUse hook payload we record. */
export interface PreToolUseHookInput {
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  cwd?: string;
}

export interface AuditEntry {
  ts: string;
  session: string;
  tool: string;
  input: unknown;
}

export function parseHookInput(raw: string): PreToolUseHookInput {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== "object" || data === null) {
    throw new Error("hook input must be a JSON object");
  }
  return data as PreToolUseHookInput;
}

export function toAuditEntry(
  input: PreToolUseHookInput,
  ts: string,
): AuditEntry {
  return {
    ts,
    session: input.session_id ?? "unknown",
    tool: input.tool_name ?? "unknown",
    input: input.tool_input ?? null,
  };
}

export function formatAuditLine(entry: AuditEntry): string {
  return JSON.stringify(entry) + "\n";
}

/** Append a pre-formatted line to the audit log, creating the directory if needed. */
export function appendAudit(logPath: string, line: string): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, line);
}
