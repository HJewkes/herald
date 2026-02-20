import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { ScheduleConfig } from './types.js';

const PLIST_LABEL = 'com.herald.scheduler';
const PLIST_PATH = join(
  homedir(),
  'Library',
  'LaunchAgents',
  `${PLIST_LABEL}.plist`,
);

const DEFAULT_PATH_DIRS = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/opt/homebrew/bin',
  join(homedir(), '.claude', 'bin'),
  join(homedir(), '.npm-global', 'bin'),
];

export function buildLaunchdPath(): string {
  const dirs = new Set(DEFAULT_PATH_DIRS);
  try {
    const claudePath = execFileSync('which', ['claude'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (claudePath) {
      dirs.add(dirname(claudePath));
    }
  } catch {
    // claude not found in current PATH — rely on default dirs
  }
  return [...dirs].join(':');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generatePlist(
  schedule: ScheduleConfig,
  projectRoot: string,
): string {
  const safeRoot = escapeXml(projectRoot);
  const calendarIntervals = schedule.times
    .map((time) => {
      const match = time.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) {
        throw new Error(`Invalid schedule time "${time}": expected HH:MM format`);
      }
      const hour = Number(match[1]);
      const minute = Number(match[2]);
      if (hour > 23 || minute > 59) {
        throw new Error(`Invalid schedule time "${time}": hour must be 0-23, minute must be 0-59`);
      }
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
    <string>${safeRoot}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${calendarIntervals}
  </array>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(projectRoot, 'journal', 'launchd-stdout.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(projectRoot, 'journal', 'launchd-stderr.log'))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(buildLaunchdPath())}</string>
  </dict>
</dict>
</plist>`;
}

export function installSchedule(
  schedule: ScheduleConfig,
  projectRoot: string,
): void {
  const plist = generatePlist(schedule, projectRoot);
  writeFileSync(PLIST_PATH, plist);
  execFileSync('launchctl', ['load', PLIST_PATH]);
}

export function uninstallSchedule(): void {
  if (!existsSync(PLIST_PATH)) {
    console.log('No schedule installed.');
    return;
  }
  execFileSync('launchctl', ['unload', PLIST_PATH]);
  unlinkSync(PLIST_PATH);
}

export function getScheduleStatus(): string {
  if (!existsSync(PLIST_PATH)) {
    return 'Schedule: not installed';
  }

  try {
    const output = execFileSync('launchctl', ['list', PLIST_LABEL], {
      encoding: 'utf-8',
    });
    return `Schedule: installed\n${output}`;
  } catch {
    return 'Schedule: installed (not currently loaded)';
  }
}
