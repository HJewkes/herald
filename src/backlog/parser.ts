import matter from 'gray-matter';
import type { BacklogItem, TaskType, Priority, TaskStatus } from '../types.js';

const VALID_TASK_TYPES = new Set<string>(['task', 'recurring', 'monitor']);
const VALID_PRIORITIES = new Set<string>(['high', 'medium', 'low']);
const VALID_STATUSES = new Set<string>(['pending', 'in-progress', 'done', 'blocked']);

const REQUIRED_FIELDS = ['id', 'type', 'priority', 'status', 'created'] as const;

function toISODateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function parseBacklogItem(content: string, filePath: string): BacklogItem {
  const { data, content: body } = matter(content);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      throw new Error(`${filePath}: missing required field: ${field}`);
    }
  }

  const typeVal = String(data.type);
  if (!VALID_TASK_TYPES.has(typeVal)) {
    throw new Error(`${filePath}: invalid type: "${typeVal}" (expected: ${[...VALID_TASK_TYPES].join(', ')})`);
  }

  const priorityVal = String(data.priority);
  if (!VALID_PRIORITIES.has(priorityVal)) {
    throw new Error(`${filePath}: invalid priority: "${priorityVal}" (expected: ${[...VALID_PRIORITIES].join(', ')})`);
  }

  const statusVal = String(data.status);
  if (!VALID_STATUSES.has(statusVal)) {
    throw new Error(`${filePath}: invalid status: "${statusVal}" (expected: ${[...VALID_STATUSES].join(', ')})`);
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  return {
    id: String(data.id),
    type: typeVal as TaskType,
    priority: priorityVal as Priority,
    status: statusVal as TaskStatus,
    schedule: data.schedule ? String(data.schedule) : undefined,
    expires: data.expires ? String(data.expires) : undefined,
    project: data.project ? String(data.project) : undefined,
    allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools.map(String) : [],
    maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : 50000,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    created: toISODateString(data.created),
    lastRun: data.lastRun ? toISODateString(data.lastRun) : null,
    title,
    body: body.trim(),
    filePath,
  };
}
