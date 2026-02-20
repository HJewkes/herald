import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generatePlist,
  installSchedule,
  uninstallSchedule,
  getScheduleStatus,
} from '../src/scheduler.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import type { ScheduleConfig } from '../src/types.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
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
    expect(vi.mocked(execFileSync)).toHaveBeenCalled();
    const [cmd, args] = vi.mocked(execFileSync).mock.calls[0];
    expect(cmd).toBe('launchctl');
    expect(args).toContain('load');
  });
});

describe('uninstallSchedule', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('unloads and removes plist when it exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    uninstallSchedule();
    expect(vi.mocked(execFileSync)).toHaveBeenCalled();
    expect(vi.mocked(unlinkSync)).toHaveBeenCalled();
  });

  it('does nothing when plist does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    uninstallSchedule();
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });
});

describe('getScheduleStatus', () => {
  it('returns installed status when plist exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execFileSync).mockReturnValue(
      'PID\tStatus\tLabel\n-\t0\tcom.herald.scheduler',
    );
    const status = getScheduleStatus();
    expect(status).toContain('installed');
  });

  it('returns not installed when plist missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const status = getScheduleStatus();
    expect(status).toContain('not installed');
  });
});
