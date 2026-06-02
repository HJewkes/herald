import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAudit,
  formatAuditLine,
  parseHookInput,
  toAuditEntry,
} from "../../src/core/audit.js";

const TS = "2026-06-02T17:30:00.000Z";

describe("parseHookInput", () => {
  it("parses a JSON object", () => {
    expect(parseHookInput('{"tool_name":"Bash"}')).toEqual({
      tool_name: "Bash",
    });
  });

  it("rejects non-objects", () => {
    expect(() => parseHookInput("42")).toThrow("must be a JSON object");
    expect(() => parseHookInput("null")).toThrow("must be a JSON object");
  });
});

describe("toAuditEntry", () => {
  it("extracts session, tool, and input", () => {
    expect(
      toAuditEntry(
        {
          session_id: "s1",
          tool_name: "mcp__diet__log_meal",
          tool_input: { meal: "breakfast" },
        },
        TS,
      ),
    ).toEqual({
      ts: TS,
      session: "s1",
      tool: "mcp__diet__log_meal",
      input: { meal: "breakfast" },
    });
  });

  it("defaults missing fields", () => {
    expect(toAuditEntry({}, TS)).toEqual({
      ts: TS,
      session: "unknown",
      tool: "unknown",
      input: null,
    });
  });
});

describe("formatAuditLine", () => {
  it("serializes one JSON object per line", () => {
    const line = formatAuditLine({ ts: TS, session: "s", tool: "t", input: 1 });
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({ ts: TS, session: "s", tool: "t", input: 1 });
  });
});

describe("appendAudit", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("creates the directory and appends each call as a new line", () => {
    const dir = mkdtempSync(join(tmpdir(), "herald-audit-"));
    dirs.push(dir);
    const logPath = join(dir, "nested", "tool-calls.log");

    appendAudit(logPath, formatAuditLine({ ts: TS, session: "s", tool: "a", input: null }));
    appendAudit(logPath, formatAuditLine({ ts: TS, session: "s", tool: "b", input: null }));

    const lines = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines.map((l) => (JSON.parse(l) as { tool: string }).tool)).toEqual([
      "a",
      "b",
    ]);
  });
});
