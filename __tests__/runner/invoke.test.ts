import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPrompt } from "../../src/runner/prompts.js";
import { parseOutput } from "../../src/runner/output.js";
import { invokeClaudeCode } from "../../src/runner/invoke.js";
import { execFileSync } from "node:child_process";
import type { BacklogItem } from "../../src/types.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

function makeItem(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: "test-001",
    type: "task",
    priority: "medium",
    status: "pending",
    allowedTools: ["Read", "Write"],
    maxTokens: 50000,
    tags: [],
    created: "2026-02-20",
    lastRun: null,
    title: "Fix the bug",
    body: "## Context\nThere is a bug.\n\n## Acceptance Criteria\n- [ ] Bug is fixed",
    filePath: "/fake/task.md",
    project: "~/Documents/projects/test",
    ...overrides,
  };
}

describe("buildPrompt", () => {
  it("includes task title and body", () => {
    const prompt = buildPrompt(makeItem());
    expect(prompt).toContain("Fix the bug");
    expect(prompt).toContain("There is a bug");
    expect(prompt).toContain("feature branch");
  });
});

describe("parseOutput", () => {
  it("parses successful JSON output", () => {
    const raw = JSON.stringify({
      result: "Done",
      cost_usd: 0.05,
      total_tokens: 5000,
    });
    const result = parseOutput(raw, "test-001");
    expect(result.success).toBe(true);
    expect(result.output).toBe("Done");
    expect(result.costUsd).toBe(0.05);
  });

  it("detects needs-input pattern", () => {
    const raw = JSON.stringify({
      result: "NEEDS INPUT: Should I use option A or B?",
    });
    const result = parseOutput(raw, "test-001");
    expect(result.needsInput).toBe("Should I use option A or B?");
  });

  it("handles non-JSON output as failure", () => {
    const result = parseOutput("Error: something broke", "test-001");
    expect(result.success).toBe(false);
    expect(result.output).toBe("Error: something broke");
  });
});

describe("invokeClaudeCode", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls claude with correct args array", () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ result: "Done" }));
    const item = makeItem();
    const result = invokeClaudeCode(item, 10);
    expect(vi.mocked(execFileSync)).toHaveBeenCalledOnce();
    const [cmd, args] = vi.mocked(execFileSync).mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("--max-turns");
    expect(args).toContain("10");
    expect(args).toContain("--allowedTools");
    expect(args).toContain("Read,Write");
    expect(result.success).toBe(true);
  });

  it("returns failure result on process error", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("Process exited with code 1");
    });

    const result = invokeClaudeCode(makeItem(), 10);
    expect(result.success).toBe(false);
  });

  it("returns specific message when claude binary is not found", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    const result = invokeClaudeCode(makeItem(), 10);
    expect(result.success).toBe(false);
    expect(result.output).toContain("claude binary not found in PATH");
  });

  it("omits --allowedTools when allowedTools is empty", () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ result: "Done" }));
    invokeClaudeCode(makeItem({ allowedTools: [] }), 5);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args).not.toContain("--allowedTools");
  });
});
