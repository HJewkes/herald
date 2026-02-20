# Task 03: Config Loader

## Architectural Context

Herald's configuration lives in `herald.config.json` at the project root. The config module loads this file, merges with defaults, and validates the result. Every other module imports config to get budget thresholds, schedule times, notification recipients, and directory paths. If no config file exists, defaults are used.

## File Ownership

**May modify:**
- `src/config.ts`
- `__tests__/config.test.ts`

**Must not touch:**
- `src/types.ts` (read only)
- Any other file

**Read for context (do not modify):**
- `src/types.ts` — `HeraldConfig`, `BudgetConfig`, `ScheduleConfig`, `NotifyConfig` types

## Steps

### Step 1: Write the failing test

Create `__tests__/config.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js';
import { readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { existsSync } from 'node:fs';

describe('loadConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns defaults when no config file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const config = loadConfig('/fake/project');
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('merges partial config with defaults', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ budget: { monthlyLimitUsd: 200 } })
    );
    const config = loadConfig('/fake/project');
    expect(config.budget.monthlyLimitUsd).toBe(200);
    expect(config.budget.warningThresholdPct).toBe(DEFAULT_CONFIG.budget.warningThresholdPct);
  });

  it('resolves backlogDir and journalDir relative to project root', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const config = loadConfig('/my/project');
    expect(config.backlogDir).toBe('/my/project/backlog/active');
    expect(config.journalDir).toBe('/my/project/journal');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/config.test.ts`
Expected: FAIL (module not found)

### Step 3: Write implementation

Create `src/config.ts`:

```typescript
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
    userConfig = JSON.parse(raw) as Record<string, unknown>;
  }

  const merged = deepMerge(DEFAULT_CONFIG, userConfig) as HeraldConfig;
  merged.backlogDir = join(projectRoot, merged.backlogDir);
  merged.journalDir = join(projectRoot, merged.journalDir);

  return merged;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
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
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/config.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/config.ts __tests__/config.test.ts
git commit -m "Add config loader with defaults and deep merge"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/config.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Default config returned when no file exists
- [ ] Partial user config merges with defaults

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT add config validation with schema libraries — keep it simple
