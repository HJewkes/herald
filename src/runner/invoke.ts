import { execFileSync } from "node:child_process";
import type { BacklogItem, RunResult } from "../types.js";
import { buildPrompt } from "./prompts.js";
import { parseOutput } from "./output.js";

export function invokeClaudeCode(
  item: BacklogItem,
  maxTurns: number,
): RunResult {
  const prompt = buildPrompt(item);

  const cwd = item.project
    ? item.project.replace(/^~/, process.env.HOME ?? "")
    : process.cwd();

  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--max-turns",
    String(maxTurns),
  ];
  if (item.allowedTools.length > 0) {
    args.push("--allowedTools", item.allowedTools.join(","));
  }

  try {
    const output = execFileSync("claude", args, {
      cwd,
      encoding: "utf-8",
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return parseOutput(output, item.id);
  } catch (err) {
    const isNotFound =
      err instanceof Error && "code" in err && err.code === "ENOENT";
    const message = isNotFound
      ? "claude binary not found in PATH. Ensure Claude Code CLI is installed and available."
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      taskId: item.id,
      success: false,
      output: `Claude invocation failed: ${message}`,
    };
  }
}
