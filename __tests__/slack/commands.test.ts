import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCommand, executeCommands } from '../../src/slack/commands.js';
import type { SlackCommand, SlackState, BacklogItem } from '../../src/types.js';

vi.mock('../../src/backlog/store.js', () => ({
  BacklogStore: vi.fn(),
}));

function makeState(overrides: Partial<SlackState> = {}): SlackState {
  return {
    lastCheckedTs: '0',
    pauseRequested: false,
    messageMap: {},
    ...overrides,
  };
}

function makeItem(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: 'task-001',
    type: 'task',
    priority: 'medium',
    status: 'pending',
    allowedTools: [],
    maxTokens: 50000,
    tags: [],
    created: '2026-02-20',
    lastRun: null,
    title: 'Test task',
    body: '',
    filePath: '/fake/task-001.md',
    ...overrides,
  };
}

describe('parseCommand', () => {
  it('parses "pause"', () => {
    expect(parseCommand('pause')).toEqual({ type: 'pause' });
  });

  it('parses "resume"', () => {
    expect(parseCommand('resume')).toEqual({ type: 'resume' });
  });

  it('parses "status"', () => {
    expect(parseCommand('status')).toEqual({ type: 'status' });
  });

  it('parses "skip <taskId>"', () => {
    expect(parseCommand('skip task-001')).toEqual({ type: 'skip', taskId: 'task-001' });
  });

  it('parses "unblock <taskId>"', () => {
    expect(parseCommand('unblock task-001')).toEqual({ type: 'unblock', taskId: 'task-001' });
  });

  it('parses "priority <taskId> high"', () => {
    expect(parseCommand('priority task-001 high')).toEqual({
      type: 'priority',
      taskId: 'task-001',
      priority: 'high',
    });
  });

  it('keywords are case insensitive but task IDs are preserved', () => {
    expect(parseCommand('PAUSE')).toEqual({ type: 'pause' });
    expect(parseCommand('Skip TASK-ABC-001')).toEqual({ type: 'skip', taskId: 'TASK-ABC-001' });
    expect(parseCommand('Priority Task-XY high')).toEqual({
      type: 'priority',
      taskId: 'Task-XY',
      priority: 'high',
    });
  });

  it('trims whitespace', () => {
    expect(parseCommand('  pause  ')).toEqual({ type: 'pause' });
  });

  it('returns null for unrecognized commands', () => {
    expect(parseCommand('hello')).toBeNull();
    expect(parseCommand('priority task-001 urgent')).toBeNull();
    expect(parseCommand('')).toBeNull();
  });
});

describe('executeCommands', () => {
  const mockStore = {
    list: vi.fn(),
    updateStatus: vi.fn(),
    updateLastRun: vi.fn(),
    updatePriority: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('executes pause command', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    const state = makeState();
    const responses = executeCommands(
      [{ type: 'pause' }],
      mockStore as never,
      state,
    );

    expect(state.pauseRequested).toBe(true);
    expect(responses[0]).toContain('paused');
  });

  it('executes resume command', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    const state = makeState({ pauseRequested: true });
    const responses = executeCommands(
      [{ type: 'resume' }],
      mockStore as never,
      state,
    );

    expect(state.pauseRequested).toBe(false);
    expect(responses[0]).toContain('resumed');
  });

  it('executes status command', () => {
    const items = [
      makeItem({ status: 'pending' }),
      makeItem({ id: 't2', status: 'blocked' }),
      makeItem({ id: 't3', status: 'done' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const state = makeState();
    const responses = executeCommands(
      [{ type: 'status' }],
      mockStore as never,
      state,
    );

    expect(responses[0]).toContain('1 pending');
    expect(responses[0]).toContain('1 blocked');
    expect(responses[0]).toContain('1 done');
  });

  it('executes skip command', () => {
    const item = makeItem();
    mockStore.list.mockReturnValue({ items: [item], warnings: [] });

    const state = makeState();
    const responses = executeCommands(
      [{ type: 'skip', taskId: 'task-001' }],
      mockStore as never,
      state,
    );

    expect(mockStore.updateStatus).toHaveBeenCalledWith(item.filePath, 'done');
    expect(responses[0]).toContain('Skipped');
  });

  it('reports error for skip with unknown task', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const responses = executeCommands(
      [{ type: 'skip', taskId: 'nope' }],
      mockStore as never,
      makeState(),
    );

    expect(responses[0]).toContain('not found');
  });

  it('executes unblock command on blocked task', () => {
    const item = makeItem({ status: 'blocked' });
    mockStore.list.mockReturnValue({ items: [item], warnings: [] });

    const responses = executeCommands(
      [{ type: 'unblock', taskId: 'task-001' }],
      mockStore as never,
      makeState(),
    );

    expect(mockStore.updateStatus).toHaveBeenCalledWith(item.filePath, 'pending');
    expect(responses[0]).toContain('Unblocked');
  });

  it('warns when unblocking a non-blocked task', () => {
    const item = makeItem({ status: 'pending' });
    mockStore.list.mockReturnValue({ items: [item], warnings: [] });

    const responses = executeCommands(
      [{ type: 'unblock', taskId: 'task-001' }],
      mockStore as never,
      makeState(),
    );

    expect(responses[0]).toContain('not blocked');
  });

  it('executes priority command', () => {
    const item = makeItem();
    mockStore.list.mockReturnValue({ items: [item], warnings: [] });

    const responses = executeCommands(
      [{ type: 'priority', taskId: 'task-001', priority: 'high' }],
      mockStore as never,
      makeState(),
    );

    expect(mockStore.updatePriority).toHaveBeenCalledWith(item.filePath, 'high');
    expect(responses[0]).toContain('high');
  });

  it('executes multiple commands in sequence', () => {
    const commands: SlackCommand[] = [{ type: 'pause' }, { type: 'status' }];
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const state = makeState();
    const responses = executeCommands(commands, mockStore as never, state);

    expect(responses).toHaveLength(2);
    expect(state.pauseRequested).toBe(true);
  });

  it('calls store.list only once for multiple commands', () => {
    const commands: SlackCommand[] = [
      { type: 'skip', taskId: 'task-001' },
      { type: 'status' },
    ];
    mockStore.list.mockReturnValue({ items: [makeItem()], warnings: [] });

    executeCommands(commands, mockStore as never, makeState());

    expect(mockStore.list).toHaveBeenCalledOnce();
  });
});
