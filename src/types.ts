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
  weeklyTokenLimit: number;
  bufferDays: number;
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
  usedTokens: number;
  paceCap: number;
  weeklyLimit: number;
  dayOfWeek: number;
  usedPct: number;
  paceCapPct: number;
  overPace: boolean;
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

export interface BacklogListResult {
  items: BacklogItem[];
  warnings: string[];
}

export interface HeartbeatSummary {
  timestamp: string;
  tasksCompleted: string[];
  tasksSkipped: string[];
  tasksBlocked: string[];
  needsInput: string[];
  budget: BudgetStatus;
}
