import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { existsSync } from 'node:fs';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns defaults when no config file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const config = loadConfig('/fake/project');
    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      backlogDir: '/fake/project/backlog/active',
      journalDir: '/fake/project/journal',
    });
  });

  it('merges partial config with defaults', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ budget: { weeklyTokenLimit: 10000000 } })
    );
    const config = loadConfig('/fake/project');
    expect(config.budget.weeklyTokenLimit).toBe(10000000);
    expect(config.budget.bufferDays).toBe(DEFAULT_CONFIG.budget.bufferDays);
  });

  it('resolves backlogDir and journalDir relative to project root', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const config = loadConfig('/my/project');
    expect(config.backlogDir).toBe('/my/project/backlog/active');
    expect(config.journalDir).toBe('/my/project/journal');
  });

  it('throws clear error on invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{ invalid json }');
    expect(() => loadConfig('/fake/project')).toThrow('Invalid JSON in herald.config.json');
  });

  it('throws when merged config has invalid shape', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ budget: 'not-an-object' })
    );
    expect(() => loadConfig('/fake/project')).toThrow('Invalid config: budget must be an object');
  });

  it('throws when budget fields have wrong types', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ budget: { weeklyTokenLimit: 'free' } })
    );
    expect(() => loadConfig('/fake/project')).toThrow('Invalid config: budget.weeklyTokenLimit must be a number');
  });
});
