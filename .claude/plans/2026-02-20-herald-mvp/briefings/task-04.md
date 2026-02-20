# Task 04: Backlog Parser

## Architectural Context

Backlog items are markdown files with YAML frontmatter stored in `backlog/active/`. The parser reads a markdown file and returns a typed `BacklogItem` object. It uses `gray-matter` (already a dependency) to parse the frontmatter. The parser is a pure function — it takes file content and path, returns a parsed item. No filesystem access in the parser itself.

## File Ownership

**May modify:**
- `src/backlog/parser.ts`
- `__tests__/backlog/parser.test.ts`

**Must not touch:**
- `src/types.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `BacklogItem`, `TaskType`, `Priority`, `TaskStatus` types

## Steps

### Step 1: Write the failing test

Create `__tests__/backlog/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseBacklogItem } from '../../src/backlog/parser.js';

const VALID_ITEM = `---
id: 2026-02-20-001
type: task
priority: high
status: pending
project: ~/Documents/projects/brain
allowedTools:
  - Read
  - Write
maxTokens: 50000
tags: [maintenance]
created: 2026-02-20
lastRun: null
---

# Fix brain search

## Context
The search command has a bug.

## Acceptance Criteria
- [ ] Bug is fixed
`;

describe('parseBacklogItem', () => {
  it('parses valid markdown with frontmatter', () => {
    const item = parseBacklogItem(VALID_ITEM, '/path/to/item.md');
    expect(item.id).toBe('2026-02-20-001');
    expect(item.type).toBe('task');
    expect(item.priority).toBe('high');
    expect(item.status).toBe('pending');
    expect(item.title).toBe('Fix brain search');
    expect(item.allowedTools).toEqual(['Read', 'Write']);
    expect(item.maxTokens).toBe(50000);
    expect(item.filePath).toBe('/path/to/item.md');
    expect(item.body).toContain('The search command has a bug.');
  });

  it('extracts title from first h1 heading', () => {
    const item = parseBacklogItem(VALID_ITEM, '/path/item.md');
    expect(item.title).toBe('Fix brain search');
  });

  it('throws on missing required fields', () => {
    const bad = `---
type: task
---
# No id`;
    expect(() => parseBacklogItem(bad, '/path/bad.md')).toThrow('missing required field: id');
  });

  it('defaults optional fields', () => {
    const minimal = `---
id: test-001
type: task
priority: medium
status: pending
created: 2026-02-20
---
# Minimal task`;
    const item = parseBacklogItem(minimal, '/path/min.md');
    expect(item.allowedTools).toEqual([]);
    expect(item.maxTokens).toBe(50000);
    expect(item.tags).toEqual([]);
    expect(item.lastRun).toBeNull();
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/backlog/parser.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/backlog/parser.ts`:

```typescript
import matter from 'gray-matter';
import type { BacklogItem, TaskType, Priority, TaskStatus } from '../types.js';

const REQUIRED_FIELDS = ['id', 'type', 'priority', 'status', 'created'] as const;

export function parseBacklogItem(content: string, filePath: string): BacklogItem {
  const { data, content: body } = matter(content);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      throw new Error(`${filePath}: missing required field: ${field}`);
    }
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  return {
    id: String(data.id),
    type: data.type as TaskType,
    priority: data.priority as Priority,
    status: data.status as TaskStatus,
    schedule: data.schedule ? String(data.schedule) : undefined,
    expires: data.expires ? String(data.expires) : undefined,
    project: data.project ? String(data.project) : undefined,
    allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools.map(String) : [],
    maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : 50000,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    created: String(data.created),
    lastRun: data.lastRun ? String(data.lastRun) : null,
    title,
    body: body.trim(),
    filePath,
  };
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/backlog/parser.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/backlog/parser.ts __tests__/backlog/parser.test.ts
git commit -m "Add backlog markdown parser with YAML frontmatter support"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/backlog/parser.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Parses valid frontmatter + markdown body
- [ ] Throws on missing required fields
- [ ] Defaults optional fields correctly

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT add filesystem access — the parser takes string content, not file paths to read
