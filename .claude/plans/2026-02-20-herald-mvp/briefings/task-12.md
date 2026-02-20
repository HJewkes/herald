# Task 12: launchd Scheduler

## Architectural Context

Herald uses macOS launchd to schedule heartbeat runs. The scheduler module generates a launchd plist file, loads it with `launchctl`, and can unload/remove it. The plist runs `herald run` at configured times. The plist is installed to `~/Library/LaunchAgents/com.herald.scheduler.plist`.

## File Ownership

**May modify:**
- `src/scheduler.ts`
- `__tests__/scheduler.test.ts`

**Must not touch:**
- `src/types.ts` (read only)
- `src/config.ts` (read only)

**Read for context (do not modify):**
- `src/types.ts` — `ScheduleConfig` type

## Steps

### Step 1: Write the failing test

Create `__tests__/scheduler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePlist, installSchedule, uninstallSchedule, getScheduleStatus } from '../src/scheduler.js';
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import type { ScheduleConfig } from '../src/types.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

const schedule: ScheduleConfig = {
  times: ['09:00', '13:00', '18:00'],
  timezone: 'America/Los_Angeles',
};

describe('generatePlist', () => {
  it('generates valid plist XML with calendar intervals', () => {
    const plist = generatePlist(schedule, '/Users/test/herald');
    expect(plist).toContain('<?xml');
    expect(plist).toContain('com.herald.scheduler');
    expect(plist).toContain('<key>Hour</key>');
    expect(plist).toContain('<integer>9</integer>');
    expect(plist).toContain('<integer>13</integer>');
    expect(plist).toContain('<integer>18</integer>');
    expect(plist).toContain('herald');
    expect(plist).toContain('run');
  });

  it('includes project root as argument', () => {
    const plist = generatePlist(schedule, '/Users/test/herald');
    expect(plist).toContain('/Users/test/herald');
  });
});

describe('installSchedule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('writes plist and loads with launchctl', () => {
    installSchedule(schedule, '/Users/test/herald');
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    expect(vi.mocked(execSync)).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain('launchctl');
  });
});

describe('uninstallSchedule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('unloads and removes plist when it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    uninstallSchedule();
    expect(vi.mocked(execSync)).toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).toHaveBeenCalled();
  });

  it('does nothing when plist does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    uninstallSchedule();
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });
});

describe('getScheduleStatus', () => {
  it('returns installed status when plist exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockReturnValue(Buffer.from('PID\tStatus\tLabel\n-\t0\tcom.herald.scheduler'));
    const status = getScheduleStatus();
    expect(status).toContain('installed');
  });

  it('returns not installed when plist missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const status = getScheduleStatus();
    expect(status).toContain('not installed');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npm test -- __tests__/scheduler.test.ts`
Expected: FAIL

### Step 3: Write implementation

Create `src/scheduler.ts`:

```typescript
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ScheduleConfig } from './types.js';

const PLIST_LABEL = 'com.herald.scheduler';
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);

export function generatePlist(schedule: ScheduleConfig, projectRoot: string): string {
  const calendarIntervals = schedule.times
    .map((time) => {
      const [hour, minute] = time.split(':').map(Number);
      return `      <dict>
        <key>Hour</key>
        <integer>${hour}</integer>
        <key>Minute</key>
        <integer>${minute}</integer>
      </dict>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>herald</string>
    <string>run</string>
    <string>--project-root</string>
    <string>${projectRoot}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${calendarIntervals}
  </array>
  <key>StandardOutPath</key>
  <string>${join(projectRoot, 'journal', 'launchd-stdout.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(projectRoot, 'journal', 'launchd-stderr.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>`;
}

export function installSchedule(schedule: ScheduleConfig, projectRoot: string): void {
  const plist = generatePlist(schedule, projectRoot);
  writeFileSync(PLIST_PATH, plist);
  execSync(`launchctl load ${PLIST_PATH}`);
}

export function uninstallSchedule(): void {
  if (!existsSync(PLIST_PATH)) {
    console.log('No schedule installed.');
    return;
  }
  execSync(`launchctl unload ${PLIST_PATH}`);
  unlinkSync(PLIST_PATH);
}

export function getScheduleStatus(): string {
  if (!existsSync(PLIST_PATH)) {
    return 'Schedule: not installed';
  }

  try {
    const output = execSync(`launchctl list ${PLIST_LABEL}`, { encoding: 'utf-8' });
    return `Schedule: installed\n${output}`;
  } catch {
    return 'Schedule: installed (not currently loaded)';
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- __tests__/scheduler.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add src/scheduler.ts __tests__/scheduler.test.ts
git commit -m "Add launchd scheduler with plist generation and management"
```

## Success Criteria

- [ ] Tests pass: `npm test -- __tests__/scheduler.test.ts`
- [ ] Types check: `npm run typecheck`
- [ ] Generates valid plist XML
- [ ] Installs/uninstalls via launchctl
- [ ] Reports schedule status

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files
- Do NOT add features beyond what is specified in the steps
- Do NOT actually install the plist in tests — mock all filesystem and exec calls
