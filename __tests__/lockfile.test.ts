import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acquireLock, releaseLock } from '../src/lockfile.js';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  existsSync: vi.fn(),
}));

describe('acquireLock', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('acquires lock when no lock file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(acquireLock('/project')).toBe(true);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
  });

  it('rejects lock when another process holds it', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() })
    );
    expect(acquireLock('/project')).toBe(false);
  });

  it('rejects lock from live process even if old', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ pid: process.pid, timestamp: oldTimestamp })
    );
    expect(acquireLock('/project')).toBe(false);
  });

  it('overrides stale lock from dead process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ pid: 999999, timestamp: new Date().toISOString() })
    );
    expect(acquireLock('/project')).toBe(true);
  });
});

describe('releaseLock', () => {
  it('removes lock file', () => {
    releaseLock('/project');
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledOnce();
  });
});
