import { writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JournalEntry } from '../types.js';

export function writeEntry(journalDir: string, entry: JournalEntry): void {
  if (!existsSync(journalDir)) {
    mkdirSync(journalDir, { recursive: true });
  }

  const fileName = entry.timestamp.replace(/:/g, '-') + '.json';
  const filePath = join(journalDir, fileName);
  writeFileSync(filePath, JSON.stringify(entry, null, 2));
}

export function readEntries(journalDir: string, limit: number): JournalEntry[] {
  const files = readdirSync(journalDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  return files.map((f) => {
    const content = readFileSync(join(journalDir, f), 'utf-8');
    return JSON.parse(content) as JournalEntry;
  });
}
