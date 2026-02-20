# Task 02: Type Definitions

## Architectural Context

Herald uses TypeScript throughout. All shared types live in `src/types.ts` and are imported by every other module. This task defines the core data structures: backlog items, config, budget state, journal entries, and notification payloads. These types drive the entire system.

## File Ownership

**May modify:**
- `src/types.ts`

**Must not touch:**
- Any other file

## Steps

### Step 1: Write type definitions

Create `src/types.ts`:

```typescript
export type TaskType = 'task' | 'recurring' | 'monitor';
export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

export interface BacklogItem {
  id: string;
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  schedule?: string;
  expires?: string;
  project?: string;
  allowedTools: string[];
  maxTokens: number;
  tags: string[];
  created: string;
  lastRun: string | null;
  title: string;
  body: string;
  filePath: string;
}

export interface HeraldConfig {
  budget: BudgetConfig;
  schedule: ScheduleConfig;
  notify: NotifyConfig;
  backlogDir: string;
  journalDir: string;
}

export interface BudgetConfig {
  monthlyLimitUsd: number;
  warningThresholdPct: number;
  hardCapPct: number;
  defaultMaxTokensPerTask: number;
}

export interface ScheduleConfig {
  times: string[];
  timezone: string;
}

export interface NotifyConfig {
  imessage: {
    recipient: string;
  };
}

export interface BudgetStatus {
  usedUsd: number;
  limitUsd: number;
  usedPct: number;
  overWarning: boolean;
  overHardCap: boolean;
}

export interface JournalEntry {
  timestamp: string;
  taskId: string;
  taskTitle: string;
  status: 'success' | 'failure' | 'skipped' | 'budget-blocked';
  durationMs: number;
  tokensUsed?: number;
  costUsd?: number;
  output?: string;
  error?: string;
}

export interface RunResult {
  taskId: string;
  success: boolean;
  output: string;
  tokensUsed?: number;
  costUsd?: number;
  needsInput?: string;
}

export interface HeartbeatSummary {
  timestamp: string;
  tasksCompleted: string[];
  tasksSkipped: string[];
  tasksBlocked: string[];
  needsInput: string[];
  budget: BudgetStatus;
}
```

### Step 2: Verify types compile

Run: `npm run typecheck`
Expected: No errors.

### Step 3: Commit

```bash
git add src/types.ts
git commit -m "Add core type definitions for backlog, config, budget, and journal"
```

## Success Criteria

- [ ] `npm run typecheck` passes with no errors
- [ ] All interfaces exported and importable

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT add runtime validation here (that belongs in parser/config modules)
