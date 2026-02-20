import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HeraldConfig } from './types.js';

export const DEFAULT_CONFIG: HeraldConfig = {
  budget: {
    monthlyLimitUsd: 100,
    warningThresholdPct: 70,
    hardCapPct: 85,
    defaultMaxTokensPerTask: 50000,
  },
  schedule: {
    times: ['09:00', '13:00', '18:00'],
    timezone: 'America/Los_Angeles',
  },
  notify: {
    imessage: {
      recipient: '',
    },
  },
  backlogDir: 'backlog/active',
  journalDir: 'journal',
};

export function loadConfig(projectRoot: string): HeraldConfig {
  const configPath = join(projectRoot, 'herald.config.json');
  let userConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    try {
      userConfig = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON in herald.config.json: ${msg}`);
    }
  }

  const merged = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    userConfig,
  ) as unknown as HeraldConfig;
  merged.backlogDir = join(projectRoot, merged.backlogDir);
  merged.journalDir = join(projectRoot, merged.journalDir);

  return merged;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
