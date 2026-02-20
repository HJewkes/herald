import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_FILENAME = '.herald.lock';

export function acquireLock(projectRoot: string): boolean {
  const lockPath = join(projectRoot, LOCK_FILENAME);

  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, 'utf-8');
      const { pid, timestamp } = JSON.parse(content) as { pid: number; timestamp: string };

      try {
        process.kill(pid, 0);
        const age = Date.now() - new Date(timestamp).getTime();
        const maxAge = 30 * 60 * 1000;
        if (age > maxAge) {
          console.log(`Stale lock from PID ${pid} (${Math.round(age / 60000)}m old), overriding`);
        } else {
          return false;
        }
      } catch {
        console.log(`Removing stale lock from dead PID ${pid}`);
      }
    } catch {
      console.log('Removing corrupt lock file');
    }
  }

  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }));
  return true;
}

export function releaseLock(projectRoot: string): void {
  const lockPath = join(projectRoot, LOCK_FILENAME);
  try {
    unlinkSync(lockPath);
  } catch { /* best-effort cleanup */ }
}
