import { writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JournalEntry } from '../types.js';

export function writeEntry(journalDir: string, entry: JournalEntry): void {
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }

  const fileName = `${entry.timestamp.replace(/:/g, '-')}_${entry.taskId}.json`;
  const filePath = join(journalDir, fileName);
  writeFileSync(filePath, JSON.stringify(entry, null, 2));
}

export function readEntries(journalDir: string, limit: number): JournalEntry[] {
  if (!existsSync(journalDir)) return [];

  const files = readdirSync(journalDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  const entries: JournalEntry[] = [];
  for (const f of files) {
    try {
      const content = readFileSync(join(journalDir, f), 'utf-8');
      entries.push(JSON.parse(content) as JournalEntry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Skipping corrupt journal entry ${f}: ${msg}`);
    }
  }
  return entries;
}
