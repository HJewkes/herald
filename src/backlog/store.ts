import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { BacklogItem, BacklogListResult, TaskStatus } from '../types.js';
import { parseBacklogItem } from './parser.js';

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
}
