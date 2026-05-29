import type { BudgetStatus } from "../../types.js";

export type TaskType = "task" | "recurring" | "monitor";
export type Priority = "high" | "medium" | "low";
export type TaskStatus = "pending" | "in-progress" | "done" | "blocked";

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

export type SlackCommand =
  | { type: "skip"; taskId: string }
  | { type: "unblock"; taskId: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "priority"; taskId: string; priority: Priority }
  | { type: "status" }
  | { type: "list"; status?: TaskStatus; priority?: Priority; tag?: string }
  | { type: "add"; title: string; priority: Priority; tags: string[] }
  | { type: "show"; taskId: string }
  | { type: "help" };

export interface SlackState {
  lastCheckedTs: string;
  pauseRequested: boolean;
  messageMap: Record<string, string>;
}
