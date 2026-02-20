# Task 08: iMessage Notifier

## Architectural Context

Herald sends status reports and alerts via iMessage using macOS `osascript` to control Messages.app. This is the primary async communication channel. The notifier is a thin wrapper that takes a message string and recipient, then executes an AppleScript command. It also formats `HeartbeatSummary` objects into human-readable messages.

## File Ownership

**May modify:**
- `src/notify/imessage.ts`
- `__tests__/notify/imessage.test.ts`

**Must not touch:**
- `src/types.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `HeartbeatSummary`, `BudgetStatus` types

## Steps

### Step 1: Write the failing test

Create `__tests__/notify/imessage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatSummary, sendIMessage } from '../../src/notify/imessage.js';
import { execSync } from 'node:child_process';
import type { HeartbeatSummary } from '../../src/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('formatSummary', () => {
  it('formats a heartbeat summary into a readable message', () => {
    const summary: HeartbeatSummary = {
      timestamp: '2026-02-20T09:00:00Z',
      tasksCompleted: ['Fix brain search'],
      tasksSkipped: ['Add fuzzy matching'],
      tasksBlocked: [],
      needsInput: ['Should stale notes auto-archive?'],
      budget: {
        usedUsd: 42,
        limitUsd: 100,
        usedPct: 42,
        overWarning: false,
        overHardCap: false,
      },
    };

    const msg = formatSummary(summary);
    expect(msg).toContain('Herald Report');
    expect(msg).toContain('Fix brain search');
    expect(msg).toContain('Add fuzzy matching');
    expect(msg).toContain('auto-archive');
    expect(msg).toContain('$42/$100');
  });

  it('handles empty summary', () => {
    const summary: HeartbeatSummary = {
      timestamp: '2026-02-20T09:00:00Z',
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: [],
      budget: {
        usedUsd: 0,
        limitUsd: 100,
        usedPct: 0,
        overWarning: false,
        overHardCap: false,
      },
    };

    const msg = formatSummary(summary);
    expect(msg).toContain('Herald Report');
    expect(msg).toContain('No tasks');
  });
});

describe('sendIMessage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls osascript with correct AppleScript', () => {
    sendIMessage('+15551234567', 'Hello from Herald');
    expect(vi.mocked(execSync)).toHaveBeenCalledOnce();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain('osascript');
    expect(cmd).toContain('Hello from Herald');
    expect(cmd).toContain('+15551234567');
  });

  it('escapes special characters in message', () => {
    sendIMessage('+15551234567', 'Test "quotes" & backslash\\');
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).not.toContain('"quotes"');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/notify/imessage.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/notify/imessage.ts`:

```typescript
import { execSync } from 'node:child_process';
import type { HeartbeatSummary } from '../types.js';

export function sendIMessage(recipient: string, message: string): void {
  const escaped = message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${recipient}" of targetService
      send "${escaped}" to targetBuddy
    end tell
  `;

  execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    timeout: 10000,
  });
}

export function formatSummary(summary: HeartbeatSummary): string {
  const date = new Date(summary.timestamp);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
  const lines: string[] = [`Herald Report (${dateStr})`];

  if (summary.tasksCompleted.length > 0) {
    lines.push('', 'Completed:');
    for (const t of summary.tasksCompleted) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.tasksSkipped.length > 0) {
    lines.push('', 'Skipped:');
    for (const t of summary.tasksSkipped) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.tasksBlocked.length > 0) {
    lines.push('', 'Blocked:');
    for (const t of summary.tasksBlocked) {
      lines.push(`- ${t}`);
    }
  }

  if (summary.needsInput.length > 0) {
    lines.push('', 'Needs input:');
    for (const t of summary.needsInput) {
      lines.push(`- ${t}`);
    }
  }

  if (
    summary.tasksCompleted.length === 0 &&
    summary.tasksSkipped.length === 0 &&
    summary.tasksBlocked.length === 0
  ) {
    lines.push('', 'No tasks to process.');
  }

  const { usedUsd, limitUsd, usedPct } = summary.budget;
  lines.push('', `Budget: $${usedUsd}/$${limitUsd} (${usedPct}%)`);

  return lines.join('\n');
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/notify/imessage.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/notify/imessage.ts __tests__/notify/imessage.test.ts
git commit -m "Add iMessage notifier with summary formatting"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/notify/imessage.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Formats summary with all sections
- [ ] Handles empty summaries gracefully
- [ ] Escapes special characters in messages

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT actually send iMessages in tests — mock execSync
