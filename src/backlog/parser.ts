import matter from 'gray-matter';
import type { BacklogItem, TaskType, Priority, TaskStatus } from '../types.js';

const REQUIRED_FIELDS = ['id', 'type', 'priority', 'status', 'created'] as const;

export function parseBacklogItem(content: string, filePath: string): BacklogItem {
  const { data, content: body } = matter(content);

  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) {
      throw new Error(`${filePath}: missing required field: ${field}`);
    }
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  return {
    id: String(data.id),
    type: data.type as TaskType,
    priority: data.priority as Priority,
    status: data.status as TaskStatus,
    schedule: data.schedule ? String(data.schedule) : undefined,
    expires: data.expires ? String(data.expires) : undefined,
    project: data.project ? String(data.project) : undefined,
    allowedTools: Array.isArray(data.allowedTools) ? data.allowedTools.map(String) : [],
    maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : 50000,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    created: String(data.created),
    lastRun: data.lastRun ? String(data.lastRun) : null,
    title,
    body: body.trim(),
    filePath,
  };
}
