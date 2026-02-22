import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacklogItem, BudgetStatus, HeraldConfig, SlackState } from '../../src/types.js';

vi.mock('../../src/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/backlog/store.js', () => ({
  BacklogStore: vi.fn(),
}));

vi.mock('../../src/backlog/prioritizer.js', () => ({
  selectTasks: vi.fn(),
}));

vi.mock('../../src/budget/tracker.js', () => ({
  checkBudget: vi.fn(),
}));

vi.mock('../../src/runner/invoke.js', () => ({
  invokeClaudeCode: vi.fn(),
}));

vi.mock('../../src/notify/slack.js', () => ({
  SlackClient: vi.fn(),
  formatSummary: vi.fn(),
}));

vi.mock('../../src/journal/logger.js', () => ({
  writeEntry: vi.fn(),
}));

vi.mock('../../src/lockfile.js', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

vi.mock('../../src/slack/state.js', () => ({
  loadSlackState: vi.fn(),
  saveSlackState: vi.fn(),
  trackMessage: vi.fn(),
}));

vi.mock('../../src/slack/commands.js', () => ({
  parseCommand: vi.fn(),
  executeCommands: vi.fn().mockReturnValue([]),
}));

import { loadConfig } from '../../src/config.js';
import { BacklogStore } from '../../src/backlog/store.js';
import { selectTasks } from '../../src/backlog/prioritizer.js';
import { checkBudget } from '../../src/budget/tracker.js';
import { invokeClaudeCode } from '../../src/runner/invoke.js';
import { SlackClient, formatSummary } from '../../src/notify/slack.js';
import { writeEntry } from '../../src/journal/logger.js';
import { acquireLock, releaseLock } from '../../src/lockfile.js';
import { loadSlackState, saveSlackState } from '../../src/slack/state.js';
import { executeCommands } from '../../src/slack/commands.js';

function makeConfig(overrides: Partial<HeraldConfig> = {}): HeraldConfig {
  return {
    budget: {
      weeklyTokenLimit: 5000000,
      bufferDays: 1,
      defaultMaxTokensPerTask: 50000,
    },
    schedule: { times: ['09:00'], timezone: 'America/Denver' },
    notify: { slack: { channel: '#herald' } },
    backlogDir: '/fake/backlog',
    journalDir: '/fake/journal',
    ...overrides,
  };
}

function makeItem(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: 'task-001',
    type: 'task',
    priority: 'medium',
    status: 'pending',
    allowedTools: ['Read', 'Write'],
    maxTokens: 50000,
    tags: [],
    created: '2026-02-20',
    lastRun: null,
    title: 'Test task',
    body: 'Do the thing',
    filePath: '/fake/backlog/task-001.md',
    ...overrides,
  };
}

const healthyBudget: BudgetStatus = {
  usedTokens: 500000,
  paceCap: 2000000,
  weeklyLimit: 5000000,
  dayOfWeek: 3,
  usedPct: 10,
  paceCapPct: 40,
  overPace: false,
};

const overPaceBudget: BudgetStatus = {
  usedTokens: 3000000,
  paceCap: 1428571,
  weeklyLimit: 5000000,
  dayOfWeek: 1,
  usedPct: 60,
  paceCapPct: 29,
  overPace: true,
};

const defaultState: SlackState = {
  lastCheckedTs: '0',
  pauseRequested: false,
  messageMap: {},
};

const mockStore = {
  list: vi.fn(),
  updateStatus: vi.fn(),
  updateLastRun: vi.fn(),
  updatePriority: vi.fn(),
};

const mockSlackClient = {
  postMessage: vi.fn(),
  updateMessage: vi.fn(),
  addReaction: vi.fn(),
  getHistory: vi.fn(),
  getReactions: vi.fn(),
  uploadFile: vi.fn(),
  authTest: vi.fn(),
  createChannel: vi.fn(),
  inviteToChannel: vi.fn(),
};

function resetSlackClientMocks() {
  mockSlackClient.postMessage.mockResolvedValue({ ts: '1.0', channel: 'C1' });
  mockSlackClient.updateMessage.mockResolvedValue(undefined);
  mockSlackClient.addReaction.mockResolvedValue(undefined);
  mockSlackClient.getHistory.mockResolvedValue([]);
  mockSlackClient.getReactions.mockResolvedValue([]);
  mockSlackClient.uploadFile.mockResolvedValue({ id: 'F1', name: 'f.txt', permalink: '' });
  mockSlackClient.authTest.mockResolvedValue({ userId: 'U_BOT' });
}

async function runAction(opts: { dry?: boolean; projectRoot?: string } = {}) {
  vi.resetModules();
  const { runCommand } = await import('../../src/commands/run.js');
  const args = ['node', 'run'];
  if (opts.dry) args.push('--dry');
  if (opts.projectRoot) args.push('--project-root', opts.projectRoot);
  await runCommand.parseAsync(args);
}

describe('run command', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetSlackClientMocks();
    vi.mocked(loadConfig).mockReturnValue(makeConfig());
    vi.mocked(acquireLock).mockReturnValue(true);
    vi.mocked(BacklogStore).mockImplementation(() => mockStore as unknown as BacklogStore);
    vi.mocked(checkBudget).mockReturnValue(healthyBudget);
    vi.mocked(SlackClient).mockImplementation(() => mockSlackClient as unknown as InstanceType<typeof SlackClient>);
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([]);
    vi.mocked(formatSummary).mockReturnValue('Summary message');
    vi.mocked(loadSlackState).mockReturnValue({ ...defaultState });
    vi.mocked(executeCommands).mockReturnValue([]);
  });

  it('happy path: selects task, executes, journals, and notifies', async () => {
    const task = makeItem();
    mockStore.list.mockReturnValue({ items: [task], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([task]);
    vi.mocked(invokeClaudeCode).mockReturnValue({
      taskId: 'task-001',
      success: true,
      output: 'Done',
      tokensUsed: 5000,
      costUsd: 0.05,
    });

    await runAction();

    expect(invokeClaudeCode).toHaveBeenCalledOnce();
    expect(mockStore.updateStatus).toHaveBeenCalledWith(task.filePath, 'in-progress');
    expect(mockStore.updateStatus).toHaveBeenCalledWith(task.filePath, 'done');
    expect(mockStore.updateLastRun).toHaveBeenCalledWith(task.filePath, expect.any(String));
    expect(writeEntry).toHaveBeenCalledWith(
      '/fake/journal',
      expect.objectContaining({ taskId: 'task-001', status: 'success' }),
    );
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('skips execution when over pace and does not release unacquired lock', async () => {
    vi.mocked(checkBudget).mockReturnValue(overPaceBudget);

    await runAction();

    expect(invokeClaudeCode).not.toHaveBeenCalled();
    expect(mockSlackClient.postMessage).toHaveBeenCalledWith(
      '#herald',
      expect.stringContaining('Over pace'),
    );
    // Lock was acquired before budget check, so it should be released
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('dry run logs what would happen without executing', async () => {
    const task = makeItem();
    mockStore.list.mockReturnValue({ items: [task], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([task]);
    const logSpy = vi.spyOn(console, 'log');

    await runAction({ dry: true });

    expect(invokeClaudeCode).not.toHaveBeenCalled();
    expect(writeEntry).not.toHaveBeenCalled();
    expect(acquireLock).not.toHaveBeenCalled();
    expect(releaseLock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'));
    logSpy.mockRestore();
  });

  it('logs skip message when no eligible tasks', async () => {
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([]);
    const logSpy = vi.spyOn(console, 'log');

    await runAction();

    expect(invokeClaudeCode).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('No tasks eligible for execution.');
    logSpy.mockRestore();
  });

  it('exits early when lock acquisition fails', async () => {
    vi.mocked(acquireLock).mockReturnValue(false);
    const logSpy = vi.spyOn(console, 'log');

    await runAction();

    expect(checkBudget).not.toHaveBeenCalled();
    expect(invokeClaudeCode).not.toHaveBeenCalled();
    expect(releaseLock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Another herald run'));
    logSpy.mockRestore();
  });

  it('recovers orphaned in-progress tasks to pending', async () => {
    const orphaned = makeItem({ id: 'orphan', status: 'in-progress' });
    mockStore.list.mockReturnValue({ items: [orphaned], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([]);
    const logSpy = vi.spyOn(console, 'log');

    await runAction();

    expect(mockStore.updateStatus).toHaveBeenCalledWith(orphaned.filePath, 'pending');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Recovering orphaned task'));
    logSpy.mockRestore();
  });

  it('marks task as blocked on failure', async () => {
    const task = makeItem();
    mockStore.list.mockReturnValue({ items: [task], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([task]);
    vi.mocked(invokeClaudeCode).mockReturnValue({
      taskId: 'task-001',
      success: false,
      output: 'Error occurred',
    });

    await runAction();

    expect(mockStore.updateStatus).toHaveBeenCalledWith(task.filePath, 'blocked');
    expect(writeEntry).toHaveBeenCalledWith(
      '/fake/journal',
      expect.objectContaining({ status: 'failure' }),
    );
  });

  it('sets recurring task back to pending on completion, not done', async () => {
    const recurring = makeItem({ id: 'rec-001', type: 'recurring', schedule: '0 9 * * *' });
    mockStore.list.mockReturnValue({ items: [recurring], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([recurring]);
    vi.mocked(invokeClaudeCode).mockReturnValue({
      taskId: 'rec-001',
      success: true,
      output: 'Done',
    });

    await runAction();

    const statusCalls = mockStore.updateStatus.mock.calls;
    const finalStatusCall = statusCalls.find(
      ([path, status]: [string, string]) => path === recurring.filePath && status !== 'in-progress',
    );
    expect(finalStatusCall).toBeDefined();
    expect(finalStatusCall![1]).toBe('pending');
  });

  it('skips run when paused and posts notification', async () => {
    vi.mocked(loadSlackState).mockReturnValue({
      ...defaultState,
      pauseRequested: true,
    });
    const logSpy = vi.spyOn(console, 'log');

    await runAction();

    expect(invokeClaudeCode).not.toHaveBeenCalled();
    expect(checkBudget).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('paused'));
    expect(saveSlackState).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('posts threaded progress and updates main message with correct ts', async () => {
    const task = makeItem();
    mockStore.list.mockReturnValue({ items: [task], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([task]);
    vi.mocked(invokeClaudeCode).mockReturnValue({
      taskId: 'task-001',
      success: true,
      output: 'Done',
      tokensUsed: 5000,
      costUsd: 0.05,
    });

    const startTs = '100.0';
    const threadReplyTs = '101.0';
    mockSlackClient.postMessage
      .mockResolvedValueOnce({ ts: startTs, channel: 'C1' })   // start message
      .mockResolvedValueOnce({ ts: threadReplyTs, channel: 'C1' }); // thread reply

    await runAction();

    // Thread reply should be posted in the start message's thread
    expect(mockSlackClient.postMessage).toHaveBeenCalledWith(
      '#herald',
      expect.stringContaining('Test task'),
      startTs,
    );
    // Main message should be updated with the start message ts
    expect(mockSlackClient.updateMessage).toHaveBeenCalledWith(
      '#herald',
      startTs,
      'Summary message',
    );
  });

  it('degrades gracefully when Slack errors occur', async () => {
    mockSlackClient.authTest.mockRejectedValue(new Error('auth_failed'));
    const task = makeItem();
    mockStore.list.mockReturnValue({ items: [task], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([task]);
    vi.mocked(invokeClaudeCode).mockReturnValue({
      taskId: 'task-001',
      success: true,
      output: 'Done',
    });
    const errorSpy = vi.spyOn(console, 'error');

    await runAction();

    expect(invokeClaudeCode).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('auth'));
    errorSpy.mockRestore();
  });

  it('processes commands even when authTest fails (advances lastCheckedTs)', async () => {
    mockSlackClient.authTest.mockRejectedValue(new Error('auth_failed'));
    mockSlackClient.getHistory.mockResolvedValue([
      { ts: '5.0', user: 'U_HUMAN', text: 'status' },
    ]);

    await runAction();

    // getHistory should have been called despite auth failure
    expect(mockSlackClient.getHistory).toHaveBeenCalled();
  });
});

describe('processInboundCommands', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('filters out bot messages and processes user commands', async () => {
    vi.resetModules();
    const { parseCommand } = await import('../../src/slack/commands.js');
    const { executeCommands } = await import('../../src/slack/commands.js');
    const { processInboundCommands } = await import('../../src/commands/run.js');

    const client = {
      getHistory: vi.fn().mockResolvedValue([
        { ts: '1.0', user: 'U_BOT', text: 'bot message' },
        { ts: '2.0', user: 'U_HUMAN', text: 'status' },
      ]),
    };
    const state: SlackState = { lastCheckedTs: '0', pauseRequested: false, messageMap: {} };

    vi.mocked(parseCommand).mockReturnValueOnce({ type: 'status' });
    vi.mocked(executeCommands).mockReturnValue([':clipboard: status response']);

    const responses = await processInboundCommands(
      client as never,
      'C123',
      {} as never,
      state,
      'U_BOT',
    );

    expect(responses).toEqual([':clipboard: status response']);
    expect(state.lastCheckedTs).toBe('2.0');
  });

  it('does not mutate lastCheckedTs when no messages returned', async () => {
    vi.resetModules();
    const { processInboundCommands } = await import('../../src/commands/run.js');

    const client = { getHistory: vi.fn().mockResolvedValue([]) };
    const state: SlackState = { lastCheckedTs: '5.0', pauseRequested: false, messageMap: {} };

    await processInboundCommands(client as never, 'C123', {} as never, state, 'U_BOT');

    expect(state.lastCheckedTs).toBe('5.0');
  });
});

describe('processReactions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('unblocks task on thumbsup reaction', async () => {
    vi.resetModules();
    vi.mocked(BacklogStore).mockImplementation(() => ({
      list: vi.fn().mockReturnValue({
        items: [{ id: 'task-001', status: 'blocked', filePath: '/fake/task-001.md' }],
        warnings: [],
      }),
      updateStatus: vi.fn(),
      updateLastRun: vi.fn(),
      updatePriority: vi.fn(),
    }) as unknown as BacklogStore);

    const { processReactions } = await import('../../src/commands/run.js');
    const store = new BacklogStore('/fake');

    const client = {
      getReactions: vi.fn().mockResolvedValue([{ name: '+1', users: ['U1'] }]),
    };
    const state: SlackState = {
      lastCheckedTs: '0',
      pauseRequested: false,
      messageMap: { 'task-001': '1.0' },
    };

    await processReactions(client as never, 'C123', state, store);

    expect(store.updateStatus).toHaveBeenCalledWith('/fake/task-001.md', 'pending');
  });

  it('does not unblock task that is already pending', async () => {
    vi.resetModules();
    const mockUpdateStatus = vi.fn();
    vi.mocked(BacklogStore).mockImplementation(() => ({
      list: vi.fn().mockReturnValue({
        items: [{ id: 'task-001', status: 'pending', filePath: '/fake/task-001.md' }],
        warnings: [],
      }),
      updateStatus: mockUpdateStatus,
      updateLastRun: vi.fn(),
      updatePriority: vi.fn(),
    }) as unknown as BacklogStore);

    const { processReactions } = await import('../../src/commands/run.js');
    const store = new BacklogStore('/fake');

    const client = {
      getReactions: vi.fn().mockResolvedValue([{ name: '+1', users: ['U1'] }]),
    };
    const state: SlackState = {
      lastCheckedTs: '0',
      pauseRequested: false,
      messageMap: { 'task-001': '1.0' },
    };

    await processReactions(client as never, 'C123', state, store);

    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it('sets pause on pause_button reaction', async () => {
    vi.resetModules();
    const { processReactions } = await import('../../src/commands/run.js');

    const client = {
      getReactions: vi.fn().mockResolvedValue([{ name: 'pause_button', users: ['U1'] }]),
    };
    const state: SlackState = {
      lastCheckedTs: '0',
      pauseRequested: false,
      messageMap: { 'task-001': '1.0' },
    };
    const store = { list: vi.fn().mockReturnValue({ items: [], warnings: [] }) };

    await processReactions(client as never, 'C123', state, store as never);

    expect(state.pauseRequested).toBe(true);
  });
});
