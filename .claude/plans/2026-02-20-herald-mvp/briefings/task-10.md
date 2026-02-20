# Task 10: Claude Runner

## Architectural Context

The runner module invokes Claude Code in headless mode via `claude -p` with a constructed prompt. It takes a `BacklogItem`, builds a prompt from the item's body and context, spawns the claude process with scoped `--allowedTools`, captures JSON output, and returns a `RunResult`. This is the core intelligence integration point — everything else in Herald is orchestration around this.

## File Ownership

**May modify:**
- `src/runner/invoke.ts`
- `src/runner/prompts.ts`
- `src/runner/output.ts`
- `__tests__/runner/invoke.test.ts`

**Must not touch:**
- `src/types.ts` (read only)
- `src/config.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `BacklogItem`, `RunResult` types
- `src/config.ts` — `HeraldConfig` type

## Steps

### Step 1: Write prompt builder

Create `src/runner/prompts.ts`:

```typescript
import type { BacklogItem } from '../types.js';

export function buildPrompt(item: BacklogItem): string {
  const lines = [
    `You are working on the following task autonomously.`,
    `Task: ${item.title}`,
    '',
    item.body,
    '',
    'Instructions:',
    '- Complete the task as described in the acceptance criteria.',
    '- Commit your work to a feature branch (never main/master).',
    '- If you cannot complete the task, explain what is blocking you.',
    '- If you need human input, clearly state the question.',
  ];

  return lines.join('\n');
}
```

### Step 2: Write output parser

Create `src/runner/output.ts`:

```typescript
import type { RunResult } from '../types.js';

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
    const needsInputMatch = output.match(/(?:NEEDS INPUT|QUESTION|BLOCKED):\s*(.+)/i);

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
```

### Step 3: Write the failing test

Create `__tests__/runner/invoke.test.ts`:

```typescript
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
```

### Step 4: Run test to verify it fails

Run: `npm test -- __tests__/runner/invoke.test.ts`
Expected: FAIL

### Step 5: Write invoke implementation

Create `src/runner/invoke.ts`:

```typescript
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
```

### Step 6: Run test to verify it passes

Run: `npm test -- __tests__/runner/invoke.test.ts`
Expected: PASS

### Step 7: Commit

```bash
git add src/runner/invoke.ts src/runner/prompts.ts src/runner/output.ts __tests__/runner/invoke.test.ts
git commit -m "Add Claude Code runner with prompt builder and output parser"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/runner/invoke.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Builds prompt from backlog item
- [ ] Parses JSON output correctly
- [ ] Detects needs-input patterns
- [ ] Handles process errors gracefully
- [ ] Passes --allowedTools and --max-turns flags

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT actually invoke claude in tests — mock execSync
- Do NOT add streaming support — MVP uses synchronous execution
