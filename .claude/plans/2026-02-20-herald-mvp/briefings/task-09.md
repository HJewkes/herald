# Task 09: Journal Logger

## Architectural Context

The journal logger records every heartbeat run as a timestamped JSON file in the `journal/` directory. Each entry captures what task was attempted, whether it succeeded, duration, and any output. The journal serves as an audit trail and is queryable via `herald journal`. Files are named `YYYY-MM-DDTHH-MM-SS.json`.

## File Ownership

**May modify:**
- `src/journal/logger.ts`
- `__tests__/journal/logger.test.ts`

**Must not touch:**
- `src/types.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `JournalEntry` type

## Steps

### Step 1: Write the failing test

Create `__tests__/journal/logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeEntry, readEntries } from '../../src/journal/logger.js';
import { writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import type { JournalEntry } from '../../src/types.js';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

const entry: JournalEntry = {
  timestamp: '2026-02-20T09:00:00Z',
  taskId: 'test-001',
  taskTitle: 'Fix brain search',
  status: 'success',
  durationMs: 45000,
  tokensUsed: 12000,
  output: 'Task completed successfully',
};

describe('writeEntry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('writes entry as JSON file with timestamp name', () => {
    writeEntry('/fake/journal', entry);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const filePath = vi.mocked(writeFileSync).mock.calls[0][0] as string;
    expect(filePath).toMatch(/2026-02-20T09-00-00Z\.json$/);
    const content = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    const parsed = JSON.parse(content) as JournalEntry;
    expect(parsed.taskId).toBe('test-001');
  });

  it('creates journal directory if missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    writeEntry('/fake/journal', entry);
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith('/fake/journal', { recursive: true });
  });
});

describe('readEntries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reads and sorts entries newest first', () => {
    vi.mocked(readdirSync).mockReturnValue([
      '2026-02-19T09-00-00Z.json',
      '2026-02-20T09-00-00Z.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(entry));

    const entries = readEntries('/fake/journal', 10);
    expect(entries).toHaveLength(2);
  });

  it('limits number of entries returned', () => {
    vi.mocked(readdirSync).mockReturnValue([
      '2026-02-18.json',
      '2026-02-19.json',
      '2026-02-20.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(entry));

    const entries = readEntries('/fake/journal', 2);
    expect(entries).toHaveLength(2);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/journal/logger.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/journal/logger.ts`:

```typescript
import { writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JournalEntry } from '../types.js';

export function writeEntry(journalDir: string, entry: JournalEntry): void {
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }

  const fileName = entry.timestamp.replace(/:/g, '-') + '.json';
  const filePath = join(journalDir, fileName);
  writeFileSync(filePath, JSON.stringify(entry, null, 2));
}

export function readEntries(journalDir: string, limit: number): JournalEntry[] {
  const files = readdirSync(journalDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map((f) => {
    const content = readFileSync(join(journalDir, f), 'utf-8');
    return JSON.parse(content) as JournalEntry;
  });
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/journal/logger.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/journal/logger.ts __tests__/journal/logger.test.ts
git commit -m "Add journal logger for run history tracking"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/journal/logger.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Writes JSON entries with timestamp-based filenames
- [ ] Creates directory if missing
- [ ] Reads entries sorted newest first with limit

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT add log rotation or cleanup — that's post-MVP
