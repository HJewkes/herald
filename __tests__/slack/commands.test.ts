import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCommand, executeCommands } from '../../src/slack/commands.js';
import type { SlackCommand, SlackState, BacklogItem } from '../../src/types.js';

vi.mock('../../src/backlog/store.js', () => ({
  BacklogStore: vi.fn(),
  generateTaskId: vi.fn().mockReturnValue('2026-02-22-001'),
}));

const BACKLOG_DIR = '/fake/backlog';

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

  it('parses "help"', () => {
    expect(parseCommand('help')).toEqual({ type: 'help' });
    expect(parseCommand('HELP')).toEqual({ type: 'help' });
  });

  it('parses "list" with no flags', () => {
    expect(parseCommand('list')).toEqual({ type: 'list', status: undefined, priority: undefined, tag: undefined });
  });

  it('parses "list --status blocked"', () => {
    expect(parseCommand('list --status blocked')).toEqual({ type: 'list', status: 'blocked', priority: undefined, tag: undefined });
  });

  it('parses "list --priority high"', () => {
    expect(parseCommand('list --priority high')).toEqual({ type: 'list', status: undefined, priority: 'high', tag: undefined });
  });

  it('parses "list --tag refactor"', () => {
    expect(parseCommand('list --tag refactor')).toEqual({ type: 'list', status: undefined, priority: undefined, tag: 'refactor' });
  });

  it('parses list case-insensitively', () => {
    expect(parseCommand('LIST')).toEqual({ type: 'list', status: undefined, priority: undefined, tag: undefined });
    expect(parseCommand('List --Status Pending')).toEqual({ type: 'list', status: 'pending', priority: undefined, tag: undefined });
  });

  it('returns null for list with invalid status', () => {
    expect(parseCommand('list --status urgent')).toBeNull();
  });

  it('returns null for list with invalid priority', () => {
    expect(parseCommand('list --priority critical')).toBeNull();
  });

  it('parses "show <taskId>"', () => {
    expect(parseCommand('show task-001')).toEqual({ type: 'show', taskId: 'task-001' });
  });

  it('returns null for "show" without taskId', () => {
    expect(parseCommand('show')).toBeNull();
  });

  it('parses "add <title>" with defaults', () => {
    expect(parseCommand('add Fix the parser')).toEqual({
      type: 'add',
      title: 'Fix the parser',
      priority: 'medium',
      tags: [],
    });
  });

  it('parses "add <title> --priority high"', () => {
    expect(parseCommand('add Fix the parser --priority high')).toEqual({
      type: 'add',
      title: 'Fix the parser',
      priority: 'high',
      tags: [],
    });
  });

  it('parses "add <title> --tag auth,ci"', () => {
    expect(parseCommand('add Fix the parser --tag auth,ci')).toEqual({
      type: 'add',
      title: 'Fix the parser',
      priority: 'medium',
      tags: ['auth', 'ci'],
    });
  });

  it('returns null for "add" with empty title', () => {
    expect(parseCommand('add --priority high')).toBeNull();
  });

  it('returns null for "add" with invalid priority', () => {
    expect(parseCommand('add Fix it --priority critical')).toBeNull();
  });
});

describe('executeCommands', () => {
  const mockStore = {
    list: vi.fn(),
    updateStatus: vi.fn(),
    updateLastRun: vi.fn(),
    updatePriority: vi.fn(),
    create: vi.fn().mockReturnValue('/fake/new-task.md'),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockStore.create.mockReturnValue('/fake/new-task.md');
  });

  it('executes pause command', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    const state = makeState();
    const responses = executeCommands(
      [{ type: 'pause' }],
      mockStore as never,
      state,
      BACKLOG_DIR,
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
      BACKLOG_DIR,
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
      BACKLOG_DIR,
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
      BACKLOG_DIR,
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
      BACKLOG_DIR,
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
      BACKLOG_DIR,
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
      BACKLOG_DIR,
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
      BACKLOG_DIR,
    );

    expect(mockStore.updatePriority).toHaveBeenCalledWith(item.filePath, 'high');
    expect(responses[0]).toContain('high');
  });

  it('executes multiple commands in sequence', () => {
    const commands: SlackCommand[] = [{ type: 'pause' }, { type: 'status' }];
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const state = makeState();
    const responses = executeCommands(commands, mockStore as never, state, BACKLOG_DIR);

    expect(responses).toHaveLength(2);
    expect(state.pauseRequested).toBe(true);
  });

  it('calls store.list only once for multiple commands', () => {
    const commands: SlackCommand[] = [
      { type: 'skip', taskId: 'task-001' },
      { type: 'status' },
    ];
    mockStore.list.mockReturnValue({ items: [makeItem()], warnings: [] });

    executeCommands(commands, mockStore as never, makeState(), BACKLOG_DIR);

    expect(mockStore.list).toHaveBeenCalledOnce();
  });

  it('list command filters out done items', () => {
    const items = [
      makeItem({ id: 't1', status: 'pending', priority: 'high', title: 'Pending task' }),
      makeItem({ id: 't2', status: 'done', title: 'Done task' }),
      makeItem({ id: 't3', status: 'blocked', title: 'Blocked task' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const responses = executeCommands(
      [{ type: 'list' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('Backlog (2)');
    expect(responses[0]).toContain('Pending task');
    expect(responses[0]).toContain('Blocked task');
    expect(responses[0]).not.toContain('Done task');
  });

  it('list command applies --status filter', () => {
    const items = [
      makeItem({ id: 't1', status: 'pending', title: 'Pending' }),
      makeItem({ id: 't2', status: 'blocked', title: 'Blocked' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const responses = executeCommands(
      [{ type: 'list', status: 'blocked' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('Blocked');
    expect(responses[0]).not.toContain('Pending');
  });

  it('list command applies --priority filter', () => {
    const items = [
      makeItem({ id: 't1', priority: 'high', title: 'High task' }),
      makeItem({ id: 't2', priority: 'low', title: 'Low task' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const responses = executeCommands(
      [{ type: 'list', priority: 'high' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('High task');
    expect(responses[0]).not.toContain('Low task');
  });

  it('list command applies --tag filter', () => {
    const items = [
      makeItem({ id: 't1', tags: ['auth'], title: 'Auth task' }),
      makeItem({ id: 't2', tags: ['ci'], title: 'CI task' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const responses = executeCommands(
      [{ type: 'list', tag: 'auth' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('Auth task');
    expect(responses[0]).not.toContain('CI task');
  });

  it('list command returns empty message when no matches', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const responses = executeCommands(
      [{ type: 'list' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('No matching tasks');
  });

  it('list command sorts by priority', () => {
    const items = [
      makeItem({ id: 't1', priority: 'low', title: 'Low' }),
      makeItem({ id: 't2', priority: 'high', title: 'High' }),
      makeItem({ id: 't3', priority: 'medium', title: 'Medium' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const responses = executeCommands(
      [{ type: 'list' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    const highIdx = responses[0].indexOf('High');
    const mediumIdx = responses[0].indexOf('Medium');
    const lowIdx = responses[0].indexOf('Low');
    expect(highIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(lowIdx);
  });

  it('show command returns task detail', () => {
    const item = makeItem({ title: 'My task', body: 'Some body content', tags: ['auth'], project: '/my/project' });
    mockStore.list.mockReturnValue({ items: [item], warnings: [] });

    const responses = executeCommands(
      [{ type: 'show', taskId: 'task-001' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('My task');
    expect(responses[0]).toContain('task-001');
    expect(responses[0]).toContain('medium');
    expect(responses[0]).toContain('auth');
    expect(responses[0]).toContain('/my/project');
    expect(responses[0]).toContain('Some body content');
  });

  it('show command returns not found for unknown task', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const responses = executeCommands(
      [{ type: 'show', taskId: 'nope' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('not found');
  });

  it('show command truncates long body', () => {
    const item = makeItem({ body: 'x'.repeat(2000) });
    mockStore.list.mockReturnValue({ items: [item], warnings: [] });

    const responses = executeCommands(
      [{ type: 'show', taskId: 'task-001' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('...');
    expect(responses[0].length).toBeLessThan(2000);
  });

  it('add command calls store.create and confirms', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const responses = executeCommands(
      [{ type: 'add', title: 'New task', priority: 'high', tags: ['ci'] }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(mockStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New task',
        priority: 'high',
        tags: ['ci'],
      }),
    );
    expect(responses[0]).toContain('Created');
    expect(responses[0]).toContain('New task');
    expect(responses[0]).toContain('high');
  });

  it('add command returns warning when store.create throws', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    mockStore.create.mockImplementation(() => { throw new Error('disk full'); });

    const responses = executeCommands(
      [{ type: 'add', title: 'New task', priority: 'medium', tags: [] }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('Failed to create task');
    expect(responses[0]).toContain('disk full');
  });

  it('list --status done shows done items', () => {
    const items = [
      makeItem({ id: 't1', status: 'done', title: 'Done task' }),
      makeItem({ id: 't2', status: 'pending', title: 'Pending task' }),
    ];
    mockStore.list.mockReturnValue({ items, warnings: [] });

    const responses = executeCommands(
      [{ type: 'list', status: 'done' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('Done task');
    expect(responses[0]).not.toContain('Pending task');
  });

  it('help command returns text with all command names', () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });

    const responses = executeCommands(
      [{ type: 'help' }],
      mockStore as never,
      makeState(),
      BACKLOG_DIR,
    );

    expect(responses[0]).toContain('list');
    expect(responses[0]).toContain('show');
    expect(responses[0]).toContain('add');
    expect(responses[0]).toContain('skip');
    expect(responses[0]).toContain('unblock');
    expect(responses[0]).toContain('pause');
    expect(responses[0]).toContain('resume');
    expect(responses[0]).toContain('status');
    expect(responses[0]).toContain('priority');
    expect(responses[0]).toContain('help');
  });
});
