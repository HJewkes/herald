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
    expect(written).toContain("lastRun: '2026-02-20T12:00:00Z'");
  });
});
