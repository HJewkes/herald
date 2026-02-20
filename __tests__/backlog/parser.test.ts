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
