import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSlackState, saveSlackState, trackMessage } from '../../src/slack/state.js';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import type { SlackState } from '../../src/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

describe('loadSlackState', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns default state when file does not exist', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const state = loadSlackState('/project');

    expect(state).toEqual({
      lastCheckedTs: '0',
      pauseRequested: false,
      messageMap: {},
    });
  });

  it('loads state from JSON file', () => {
    const saved: SlackState = {
      lastCheckedTs: '1234.5678',
      pauseRequested: true,
      messageMap: { 'task-1': '1111.0000' },
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(saved));

    const state = loadSlackState('/project');

    expect(state.lastCheckedTs).toBe('1234.5678');
    expect(state.pauseRequested).toBe(true);
    expect(state.messageMap['task-1']).toBe('1111.0000');
  });

  it('merges partial state with defaults', () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ lastCheckedTs: '5.0' }));

    const state = loadSlackState('/project');

    expect(state.lastCheckedTs).toBe('5.0');
    expect(state.pauseRequested).toBe(false);
    expect(state.messageMap).toEqual({});
  });
});

describe('saveSlackState', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes atomically via temp file and rename', () => {
    const state: SlackState = {
      lastCheckedTs: '1.0',
      pauseRequested: false,
      messageMap: {},
    };

    saveSlackState('/project', state);

    expect(writeFileSync).toHaveBeenCalledWith(
      '/project/.herald-slack-state.json.tmp',
      JSON.stringify(state, null, 2),
    );
    expect(renameSync).toHaveBeenCalledWith(
      '/project/.herald-slack-state.json.tmp',
      '/project/.herald-slack-state.json',
    );
  });
});

describe('trackMessage', () => {
  it('adds taskId → ts mapping to state', () => {
    const state: SlackState = {
      lastCheckedTs: '0',
      pauseRequested: false,
      messageMap: {},
    };

    trackMessage(state, 'task-001', '1234.5678');

    expect(state.messageMap['task-001']).toBe('1234.5678');
  });

  it('overwrites existing mapping', () => {
    const state: SlackState = {
      lastCheckedTs: '0',
      pauseRequested: false,
      messageMap: { 'task-001': '1111.0000' },
    };

    trackMessage(state, 'task-001', '2222.0000');

    expect(state.messageMap['task-001']).toBe('2222.0000');
  });
});
