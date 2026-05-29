export interface HeraldConfig {
  budget: BudgetConfig;
  schedule: ScheduleConfig;
  notify: NotifyConfig;
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
  slack: {
    channel: string;
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
  status: "success" | "failure" | "skipped" | "budget-blocked";
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

// Slack transport types

export interface SlackPostResult {
  ts: string;
  channel: string;
}

export interface SlackMessage {
  ts: string;
  user: string;
  text: string;
  threadTs?: string;
}

export interface SlackReaction {
  name: string;
  users: string[];
}

export interface SlackFile {
  id: string;
  name: string;
  permalink: string;
}
