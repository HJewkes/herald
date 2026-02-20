# Task 05: Backlog Store

## Architectural Context

The backlog store handles filesystem operations for backlog items: listing all items from the active directory, reading individual items, and updating item frontmatter (status, lastRun). It uses the parser (Task 04) to convert raw markdown files into typed `BacklogItem` objects. The store operates on the `backlogDir` from config.

## File Ownership

**May modify:**
- `src/backlog/store.ts`
- `__tests__/backlog/store.test.ts`

**Must not touch:**
- `src/backlog/parser.ts` (read only)
- `src/types.ts` (read only)

**Read for context (do not modify):**
- `src/backlog/parser.ts` — `parseBacklogItem` function
- `src/types.ts` — `BacklogItem`, `TaskStatus` types

## Steps

### Step 1: Write the failing test

Create `__tests__/backlog/store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacklogStore } from '../../src/backlog/store.js';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const ITEM_CONTENT = `---
id: test-001
type: task
priority: high
status: pending
created: 2026-02-20
lastRun: null
---

# Test task

## Context
Test context.
`;

describe('BacklogStore', () => {
  let store: BacklogStore;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new BacklogStore('/fake/backlog/active');
  });

  it('lists all markdown files as backlog items', () => {
    vi.mocked(readdirSync).mockReturnValue(['task-001.md', 'task-002.md', '.gitkeep'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    const items = store.list();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('test-001');
  });

  it('ignores non-markdown files', () => {
    vi.mocked(readdirSync).mockReturnValue(['.gitkeep', 'notes.txt'] as unknown as ReturnType<typeof readdirSync>);
    const items = store.list();
    expect(items).toHaveLength(0);
  });

  it('updates item status in frontmatter', () => {
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    store.updateStatus('/fake/backlog/active/task-001.md', 'done');
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain('status: done');
  });

  it('updates lastRun timestamp', () => {
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    store.updateLastRun('/fake/backlog/active/task-001.md', '2026-02-20T12:00:00Z');
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain('lastRun: "2026-02-20T12:00:00Z"');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/backlog/store.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/backlog/store.ts`:

```typescript
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { BacklogItem, TaskStatus } from '../types.js';
import { parseBacklogItem } from './parser.js';

export class BacklogStore {
  constructor(private readonly dir: string) {}

  list(): BacklogItem[] {
    const files = readdirSync(this.dir)
      .filter((f) => f.endsWith('.md'));

    return files.map((f) => {
      const filePath = join(this.dir, f);
      const content = readFileSync(filePath, 'utf-8');
      return parseBacklogItem(content, filePath);
    });
  }

  updateStatus(filePath: string, status: TaskStatus): void {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    data.status = status;
    const updated = matter.stringify(body, data);
    writeFileSync(filePath, updated);
  }

  updateLastRun(filePath: string, timestamp: string): void {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    data.lastRun = timestamp;
    const updated = matter.stringify(body, data);
    writeFileSync(filePath, updated);
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/backlog/store.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/backlog/store.ts __tests__/backlog/store.test.ts
git commit -m "Add backlog store with list, updateStatus, and updateLastRun"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/backlog/store.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Lists all .md files from backlog directory
- [ ] Updates frontmatter fields without corrupting file content

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT add archive/delete functionality — that's post-MVP
