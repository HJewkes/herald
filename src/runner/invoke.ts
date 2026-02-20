import { execSync } from 'node:child_process';
import type { BacklogItem, RunResult } from '../types.js';
import { buildPrompt } from './prompts.js';
import { parseOutput } from './output.js';

export function invokeClaudeCode(item: BacklogItem, maxTurns: number): RunResult {
  const prompt = buildPrompt(item);
  const allowedTools = item.allowedTools.length > 0
    ? `--allowedTools ${item.allowedTools.join(',')}`
    : '';

  const cwd = item.project
    ? item.project.replace(/^~/, process.env.HOME ?? '')
    : process.cwd();

  const cmd = [
    'claude',
    '-p',
    `"${prompt.replace(/"/g, '\\"')}"`,
    '--output-format json',
    `--max-turns ${maxTurns}`,
    allowedTools,
  ].filter(Boolean).join(' ');

  try {
    const output = execSync(cmd, {
      cwd,
      encoding: 'utf-8',
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return parseOutput(output, item.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      taskId: item.id,
      success: false,
      output: `Claude invocation failed: ${message}`,
    };
  }
}
