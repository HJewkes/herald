# Task 11: CLI Commands + Heartbeat Loop

## Architectural Context

This is the integration task — wiring all modules together into the Commander CLI and implementing the heartbeat loop (`herald run`). The CLI is the user-facing entry point. The `run` command orchestrates the full heartbeat: load config, check budget, scan backlog, select task, invoke Claude, update backlog, notify, journal. Other commands expose individual subsystems: `backlog`, `budget`, `journal`, `notify`, `schedule`, `config`.

## File Ownership

**May modify:**
- `src/cli.ts`
- `src/commands/run.ts`
- `src/commands/backlog.ts`
- `src/commands/budget.ts`
- `src/commands/journal.ts`
- `src/commands/notify.ts`
- `src/commands/schedule.ts`
- `src/commands/config.ts`

**Must not touch:**
- All modules in `src/backlog/`, `src/budget/`, `src/runner/`, `src/notify/`, `src/journal/`, `src/scheduler.ts`, `src/config.ts`, `src/types.ts`

**Read for context (do not modify):**
- `src/config.ts` — `loadConfig`, `DEFAULT_CONFIG`
- `src/backlog/store.ts` — `BacklogStore`
- `src/backlog/prioritizer.ts` — `selectTasks`
- `src/budget/tracker.ts` — `checkBudget`
- `src/runner/invoke.ts` — `invokeClaudeCode`
- `src/notify/imessage.ts` — `sendIMessage`, `formatSummary`
- `src/journal/logger.ts` — `writeEntry`, `readEntries`
- `src/scheduler.ts` — `installSchedule`, `uninstallSchedule`, `getScheduleStatus`
- `src/types.ts` — all types

## Steps

### Step 1: Create the run command (heartbeat loop)

Create `src/commands/run.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';
import { BacklogStore } from '../backlog/store.js';
import { selectTasks } from '../backlog/prioritizer.js';
import { checkBudget } from '../budget/tracker.js';
import { invokeClaudeCode } from '../runner/invoke.js';
import { sendIMessage, formatSummary } from '../notify/imessage.js';
import { writeEntry } from '../journal/logger.js';
import type { HeartbeatSummary, JournalEntry } from '../types.js';

export const runCommand = new Command('run')
  .description('Execute one heartbeat cycle')
  .option('--dry', 'Show what would happen without executing')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action(async (opts) => {
    const config = loadConfig(opts.projectRoot);
    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

    // Check budget
    const budget = await checkBudget(config.budget, apiKey);

    if (budget.overHardCap) {
      console.log(`Budget exceeded: $${budget.usedUsd}/$${budget.limitUsd} (${budget.usedPct}%)`);
      if (config.notify.imessage.recipient) {
        sendIMessage(config.notify.imessage.recipient, `Herald: Budget limit reached ($${budget.usedUsd}/$${budget.limitUsd}). Skipping run.`);
      }
      return;
    }

    // Scan and select tasks
    const store = new BacklogStore(config.backlogDir);
    const allItems = store.list();
    const selected = selectTasks(allItems, budget);

    const summary: HeartbeatSummary = {
      timestamp: new Date().toISOString(),
      tasksCompleted: [],
      tasksSkipped: [],
      tasksBlocked: [],
      needsInput: [],
      budget,
    };

    if (selected.length === 0) {
      console.log('No tasks eligible for execution.');
      summary.tasksSkipped = allItems
        .filter((i) => i.status === 'pending')
        .map((i) => i.title);
    }

    if (opts.dry) {
      console.log('DRY RUN — would execute:');
      for (const task of selected) {
        console.log(`  [${task.priority}] ${task.title} (${task.id})`);
      }
      console.log(`\nBudget: $${budget.usedUsd}/$${budget.limitUsd} (${budget.usedPct}%)`);
      return;
    }

    // Execute selected tasks
    for (const task of selected) {
      console.log(`Executing: ${task.title} (${task.id})`);
      store.updateStatus(task.filePath, 'in-progress');

      const startTime = Date.now();
      const maxTurns = Math.floor(task.maxTokens / 5000);
      const result = invokeClaudeCode(task, Math.max(maxTurns, 5));
      const durationMs = Date.now() - startTime;

      if (result.success) {
        store.updateStatus(task.filePath, 'done');
        store.updateLastRun(task.filePath, new Date().toISOString());
        summary.tasksCompleted.push(task.title);
      } else {
        store.updateStatus(task.filePath, 'blocked');
        summary.tasksBlocked.push(task.title);
      }

      if (result.needsInput) {
        summary.needsInput.push(result.needsInput);
      }

      const entry: JournalEntry = {
        timestamp: new Date().toISOString(),
        taskId: task.id,
        taskTitle: task.title,
        status: result.success ? 'success' : 'failure',
        durationMs,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        output: result.output.slice(0, 2000),
      };
      writeEntry(config.journalDir, entry);
    }

    // Notify
    if (config.notify.imessage.recipient) {
      const message = formatSummary(summary);
      sendIMessage(config.notify.imessage.recipient, message);
    }

    console.log('Heartbeat complete.');
  });
```

### Step 2: Create backlog command

Create `src/commands/backlog.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';
import { BacklogStore } from '../backlog/store.js';

export const backlogCommand = new Command('backlog')
  .description('Manage backlog items');

backlogCommand
  .command('list')
  .description('Show current backlog sorted by priority')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const store = new BacklogStore(config.backlogDir);
    const items = store.list();

    if (items.length === 0) {
      console.log('Backlog is empty.');
      return;
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
    items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    for (const item of items) {
      const statusIcon = { pending: ' ', 'in-progress': '>', done: 'x', blocked: '!' }[item.status];
      console.log(`[${statusIcon}] [${item.priority}] ${item.title} (${item.id})`);
    }
  });
```

### Step 3: Create budget command

Create `src/commands/budget.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';
import { checkBudget } from '../budget/tracker.js';

export const budgetCommand = new Command('budget')
  .description('Show current usage vs limits')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action(async (opts) => {
    const config = loadConfig(opts.projectRoot);
    const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
    const status = await checkBudget(config.budget, apiKey);

    console.log(`Usage: $${status.usedUsd}/$${status.limitUsd} (${status.usedPct}%)`);
    if (status.overHardCap) console.log('STATUS: OVER HARD CAP — runs blocked');
    else if (status.overWarning) console.log('STATUS: WARNING — approaching limit');
    else console.log('STATUS: OK');
  });
```

### Step 4: Create journal command

Create `src/commands/journal.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';
import { readEntries } from '../journal/logger.js';

export const journalCommand = new Command('journal')
  .description('Show recent run history')
  .option('--limit <n>', 'Number of entries to show', '10')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const entries = readEntries(config.journalDir, parseInt(opts.limit, 10));

    if (entries.length === 0) {
      console.log('No journal entries.');
      return;
    }

    for (const entry of entries) {
      const date = new Date(entry.timestamp).toLocaleString();
      const cost = entry.costUsd ? ` ($${entry.costUsd.toFixed(3)})` : '';
      console.log(`[${date}] ${entry.status}: ${entry.taskTitle}${cost}`);
    }
  });
```

### Step 5: Create notify command

Create `src/commands/notify.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';
import { sendIMessage } from '../notify/imessage.js';

export const notifyCommand = new Command('notify')
  .description('Notification management');

notifyCommand
  .command('test')
  .description('Send a test iMessage')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    const recipient = config.notify.imessage.recipient;

    if (!recipient) {
      console.error('No iMessage recipient configured. Set notify.imessage.recipient in herald.config.json');
      process.exitCode = 1;
      return;
    }

    sendIMessage(recipient, 'Herald test message. If you see this, notifications are working.');
    console.log(`Test message sent to ${recipient}`);
  });
```

### Step 6: Create schedule command

Create `src/commands/schedule.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';
import { installSchedule, uninstallSchedule, getScheduleStatus } from '../scheduler.js';

export const scheduleCommand = new Command('schedule')
  .description('Manage launchd schedule');

scheduleCommand
  .command('install')
  .description('Generate and load launchd plist')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    installSchedule(config.schedule, opts.projectRoot);
    console.log('Schedule installed.');
  });

scheduleCommand
  .command('uninstall')
  .description('Remove launchd plist')
  .action(() => {
    uninstallSchedule();
    console.log('Schedule removed.');
  });

scheduleCommand
  .command('status')
  .description('Show schedule status')
  .action(() => {
    const status = getScheduleStatus();
    console.log(status);
  });
```

### Step 7: Create config command

Create `src/commands/config.ts`:

```typescript
import { Command } from '@commander-js/extra-typings';
import { loadConfig } from '../config.js';

export const configCommand = new Command('config')
  .description('Show configuration')
  .option('--project-root <path>', 'Herald project root', process.cwd())
  .action((opts) => {
    const config = loadConfig(opts.projectRoot);
    console.log(JSON.stringify(config, null, 2));
  });
```

### Step 8: Wire CLI entry point

Update `src/cli.ts`:

```typescript
#!/usr/bin/env node
import { Command } from '@commander-js/extra-typings';
import { runCommand } from './commands/run.js';
import { backlogCommand } from './commands/backlog.js';
import { budgetCommand } from './commands/budget.js';
import { journalCommand } from './commands/journal.js';
import { notifyCommand } from './commands/notify.js';
import { scheduleCommand } from './commands/schedule.js';
import { configCommand } from './commands/config.js';

const program = new Command()
  .name('herald')
  .description('Autonomous scheduled Claude Code agent')
  .version('0.1.0');

program.addCommand(runCommand);
program.addCommand(backlogCommand);
program.addCommand(budgetCommand);
program.addCommand(journalCommand);
program.addCommand(notifyCommand);
program.addCommand(scheduleCommand);
program.addCommand(configCommand);

program.parseAsync().catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});
```

### Step 9: Verify

Run: `npm run typecheck`
Expected: No errors.

Run: `npm run build`
Expected: Clean build.

Run: `node dist/cli.js --help`
Expected: Shows all commands.

Run: `node dist/cli.js run --dry --project-root .`
Expected: Shows "No tasks eligible" or dry run output.

### Step 10: Commit

```bash
git add src/cli.ts src/commands/
git commit -m "Add CLI commands and heartbeat loop"
```

## Success Criteria

- [ ] Types check: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] `herald --help` shows all commands
- [ ] `herald run --dry` executes without error
- [ ] `herald backlog list` works with empty backlog
- [ ] `herald budget` shows usage info
- [ ] `herald config` shows configuration

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT add integration tests for the full heartbeat — unit tests for individual modules suffice for MVP
