import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { SlackState } from "../types.js";

const STATE_FILE = ".herald-slack-state.json";

const DEFAULT_STATE: SlackState = {
  lastCheckedTs: "0",
  pauseRequested: false,
  messageMap: {},
};

export function loadSlackState(projectRoot: string): SlackState {
  const filePath = join(projectRoot, STATE_FILE);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return { ...DEFAULT_STATE, ...JSON.parse(raw) } as SlackState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveSlackState(projectRoot: string, state: SlackState): void {
  const filePath = join(projectRoot, STATE_FILE);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  renameSync(tmpPath, filePath);
}

export function trackMessage(
  state: SlackState,
  taskId: string,
  ts: string,
): void {
  state.messageMap[taskId] = ts;
}
