import { join } from "node:path";
import { Command } from "@commander-js/extra-typings";
import {
  appendAudit,
  formatAuditLine,
  parseHookInput,
  toAuditEntry,
} from "../core/audit.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

export const hookCommand = new Command("hook").description(
  "Claude Code hook handlers (invoked by the persistent session, not by you)",
);

hookCommand
  .command("pretooluse")
  .description(
    "Audit hook: append every tool call to the audit log. Audit-only — never blocks.",
  )
  .option(
    "--audit-log <path>",
    "Audit log file",
    join(process.cwd(), "audit", "tool-calls.log"),
  )
  .action(async (opts) => {
    const raw = await readStdin();
    try {
      const input = parseHookInput(raw);
      const entry = toAuditEntry(input, new Date().toISOString());
      appendAudit(opts.auditLog, formatAuditLine(entry));
    } catch {
      // Never block a tool call because auditing failed; just don't record it.
    }
    // Exit 0 with no decision output = allow the tool call to proceed.
    process.exit(0);
  });
