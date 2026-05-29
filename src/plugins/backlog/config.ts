import { join } from "node:path";

export const DEFAULT_BACKLOG_DIR = "backlog/active";

export function resolveBacklogDir(projectRoot: string): string {
  return join(projectRoot, DEFAULT_BACKLOG_DIR);
}
