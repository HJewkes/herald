import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildPrompt } from '../../src/runner/prompts.js';
import { parseOutput } from '../../src/runner/output.js';
import { invokeClaudeCode } from '../../src/runner/invoke.js';
import { execSync } from 'node:child_process';
import type { BacklogItem } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

function makeItem(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: 'test-001',
    type: 'task',
    priority: 'medium',
    status: 'pending',
    allowedTools: ['Read', 'Write'],
    maxTokens: 50000,
    tags: [],
    created: '2026-02-20',
    lastRun: null,
    title: 'Fix the bug',
    body: '## Context\nThere is a bug.\n\n## Acceptance Criteria\n- [ ] Bug is fixed',
    filePath: '/fake/task.md',
    project: '~/Documents/projects/test',
    ...overrides,
  };
}

describe('buildPrompt', () => {
  it('includes task title and body', () => {
    const prompt = buildPrompt(makeItem());
    expect(prompt).toContain('Fix the bug');
    expect(prompt).toContain('There is a bug');
    expect(prompt).toContain('feature branch');
  });
});

describe('parseOutput', () => {
  it('parses successful JSON output', () => {
    const raw = JSON.stringify({ result: 'Done', cost_usd: 0.05, total_tokens: 5000 });
    const result = parseOutput(raw, 'test-001');
    expect(result.success).toBe(true);
    expect(result.output).toBe('Done');
    expect(result.costUsd).toBe(0.05);
  });

  it('detects needs-input pattern', () => {
    const raw = JSON.stringify({ result: 'NEEDS INPUT: Should I use option A or B?' });
    const result = parseOutput(raw, 'test-001');
    expect(result.needsInput).toBe('Should I use option A or B?');
  });

  it('handles non-JSON output as failure', () => {
    const result = parseOutput('Error: something broke', 'test-001');
    expect(result.success).toBe(false);
    expect(result.output).toBe('Error: something broke');
  });
});

describe('invokeClaudeCode', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls claude with correct flags', () => {
    vi.mocked(execSync).mockReturnValue(
      Buffer.from(JSON.stringify({ result: 'Done' }))
    );

    const item = makeItem();
    const result = invokeClaudeCode(item, 10);
    expect(vi.mocked(execSync)).toHaveBeenCalledOnce();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain('claude');
    expect(cmd).toContain('--output-format json');
    expect(cmd).toContain('--allowedTools');
    expect(cmd).toContain('--max-turns 10');
    expect(result.success).toBe(true);
  });

  it('returns failure result on process error', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Process exited with code 1');
    });

    const result = invokeClaudeCode(makeItem(), 10);
    expect(result.success).toBe(false);
  });
});
