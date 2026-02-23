import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { BacklogItem, BacklogListResult, Priority, TaskStatus } from '../types.js';
import { parseBacklogItem } from './parser.js';

export function generateTaskId(dir: string, date: Date): string {
  const datePrefix = date.toISOString().slice(0, 10);
  const existing = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.startsWith(datePrefix) && f.endsWith('.md'))
    : [];
  const suffixes = existing
    .map((f) => parseInt(f.slice(11, 14), 10))
    .filter((n) => !isNaN(n));
  const next = suffixes.length === 0 ? 1 : Math.max(...suffixes) + 1;
  return `${datePrefix}-${String(next).padStart(3, '0')}`;
}

export class BacklogStore {
  constructor(private readonly dir: string) {}

  list(): BacklogListResult {
    if (!existsSync(this.dir)) return { items: [], warnings: [] };

    const files = readdirSync(this.dir)
      .filter((f) => f.endsWith('.md'));

    const items: BacklogItem[] = [];
    const warnings: string[] = [];
    for (const f of files) {
      const filePath = join(this.dir, f);
      try {
        const content = readFileSync(filePath, 'utf-8');
        items.push(parseBacklogItem(content, filePath));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const warning = `Skipping malformed backlog item ${f}: ${msg}`;
        console.error(warning);
        warnings.push(warning);
      }
    }
    return { items, warnings };
  }

  updateStatus(filePath: string, status: TaskStatus): void {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    data.status = status;
    const updated = matter.stringify(body, data);
    writeFileSync(filePath, updated);
  }

  updateLastRun(filePath: string, timestamp: string): void {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    data.lastRun = timestamp;
    const updated = matter.stringify(body, data);
    writeFileSync(filePath, updated);
  }

  updatePriority(filePath: string, priority: Priority): void {
    const content = readFileSync(filePath, 'utf-8');
    const { data, content: body } = matter(content);
    data.priority = priority;
    const updated = matter.stringify(body, data);
    writeFileSync(filePath, updated);
  }

  create(opts: {
    id: string;
    title: string;
    priority: Priority;
    tags: string[];
    created: string;
  }): string {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
    const frontMatter = {
      id: opts.id,
      type: 'task',
      priority: opts.priority,
      status: 'pending',
      allowedTools: [] as string[],
      maxTokens: 50000,
      tags: opts.tags,
      created: opts.created,
      lastRun: null,
    };
    const body = `\n# ${opts.title}\n\n_Created via Slack._\n`;
    const content = matter.stringify(body, frontMatter);
    const filePath = join(this.dir, `${opts.id}.md`);
    writeFileSync(filePath, content);
    return filePath;
  }
}
