import { writeFileSync, readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOCK_FILENAME = ".herald.lock";

export function acquireLock(projectRoot: string): boolean {
  const lockPath = join(projectRoot, LOCK_FILENAME);

  if (existsSync(lockPath)) {
    try {
      const content = readFileSync(lockPath, "utf-8");
      const { pid } = JSON.parse(content) as { pid: number; timestamp: string };

      try {
        process.kill(pid, 0);
        // Process is alive — never override regardless of age
        return false;
      } catch {
        console.log(`Removing stale lock from dead PID ${pid}`);
      }
    } catch {
      console.log("Removing corrupt lock file");
    }
  }

  writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }),
  );
  return true;
}

export function releaseLock(projectRoot: string): void {
  const lockPath = join(projectRoot, LOCK_FILENAME);
  try {
    unlinkSync(lockPath);
  } catch {
    /* best-effort cleanup */
  }
}
