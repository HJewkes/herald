import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BacklogItem, BudgetStatus, HeraldConfig } from '../../src/types.js';

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

vi.mock('../../src/notify/imessage.js', () => ({
  sendIMessage: vi.fn(),
  formatSummary: vi.fn(),
}));

vi.mock('../../src/journal/logger.js', () => ({
  writeEntry: vi.fn(),
}));

vi.mock('../../src/lockfile.js', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}));

import { loadConfig } from '../../src/config.js';
import { BacklogStore } from '../../src/backlog/store.js';
import { selectTasks } from '../../src/backlog/prioritizer.js';
import { checkBudget } from '../../src/budget/tracker.js';
import { invokeClaudeCode } from '../../src/runner/invoke.js';
import { sendIMessage, formatSummary } from '../../src/notify/imessage.js';
import { writeEntry } from '../../src/journal/logger.js';
import { acquireLock, releaseLock } from '../../src/lockfile.js';

function makeConfig(overrides: Partial<HeraldConfig> = {}): HeraldConfig {
  return {
    budget: {
      weeklyTokenLimit: 5000000,
      bufferDays: 1,
      defaultMaxTokensPerTask: 50000,
    },
    schedule: { times: ['09:00'], timezone: 'America/Denver' },
    notify: { imessage: { recipient: '+15551234567' } },
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

const mockStore = {
  list: vi.fn(),
  updateStatus: vi.fn(),
  updateLastRun: vi.fn(),
};

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
    vi.mocked(loadConfig).mockReturnValue(makeConfig());
    vi.mocked(acquireLock).mockReturnValue(true);
    vi.mocked(BacklogStore).mockImplementation(() => mockStore as unknown as BacklogStore);
    vi.mocked(checkBudget).mockReturnValue(healthyBudget);
    mockStore.list.mockReturnValue({ items: [], warnings: [] });
    vi.mocked(selectTasks).mockReturnValue([]);
    vi.mocked(formatSummary).mockReturnValue('Summary message');
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
    expect(sendIMessage).toHaveBeenCalledWith('+15551234567', 'Summary message');
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('skips execution and sends pace notification when over pace', async () => {
    vi.mocked(checkBudget).mockReturnValue(overPaceBudget);

    await runAction();

    expect(invokeClaudeCode).not.toHaveBeenCalled();
    expect(sendIMessage).toHaveBeenCalledWith(
      '+15551234567',
      expect.stringContaining('Over pace'),
    );
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
    expect(sendIMessage).not.toHaveBeenCalled();
    expect(acquireLock).not.toHaveBeenCalled();
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
});
