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
    expect(filePath).toMatch(/2026-02-20T09-00-00Z_test-001\.json$/);
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
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      '2026-02-19T09-00-00Z.json',
      '2026-02-20T09-00-00Z.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(entry));

    const entries = readEntries('/fake/journal', 10);
    expect(entries).toHaveLength(2);
  });

  it('limits number of entries returned', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      '2026-02-18.json',
      '2026-02-19.json',
      '2026-02-20.json',
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(entry));

    const entries = readEntries('/fake/journal', 2);
    expect(entries).toHaveLength(2);
  });

  it('returns empty array when directory does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const entries = readEntries('/fake/journal', 10);
    expect(entries).toEqual([]);
  });

  it('skips corrupt JSON files and continues', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['good.json', 'bad.json'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(JSON.stringify(entry))
      .mockReturnValueOnce('not json {{{{');
    const entries = readEntries('/fake/journal', 10);
    expect(entries).toHaveLength(1);
  });
});
