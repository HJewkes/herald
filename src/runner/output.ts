import type { RunResult } from "../types.js";

interface ClaudeOutput {
  result?: string;
  cost_usd?: number;
  total_tokens?: number;
  is_error?: boolean;
}

export function parseOutput(raw: string, taskId: string): RunResult {
  try {
    const data = JSON.parse(raw) as ClaudeOutput;
    const output = data.result ?? raw;
    const needsInputMatch = output.match(
      /(?:NEEDS INPUT|QUESTION|BLOCKED):\s*(.+)/i,
    );

    return {
      taskId,
      success: !data.is_error,
      output,
      tokensUsed: data.total_tokens,
      costUsd: data.cost_usd,
      needsInput: needsInputMatch ? needsInputMatch[1] : undefined,
    };
  } catch {
    return {
      taskId,
      success: false,
      output: raw,
    };
  }
}
