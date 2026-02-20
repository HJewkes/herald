# Herald: Autonomous Scheduled Claude Code Agent

**Date:** 2026-02-20
**Status:** Approved

## Overview

Herald is a TypeScript CLI sidecar that orchestrates scheduled, autonomous Claude Code execution. It handles the non-AI orchestration (scheduling, backlog management, budget enforcement, notifications) while delegating intelligence work to Claude Code via `claude -p`.

### Design Principles

- **Scheduling lives outside the agent** — Herald triggers Claude Code, not the other way around
- **Clean separation** — sidecar for orchestration, Claude Code for reasoning
- **Budget-first** — never invoke Claude without checking headroom
- **Local-first** — runs on personal Mac, state on local filesystem
- **Leverage existing ecosystem** — Claude Code skills, brain project, chezmoi

## Architecture

```
launchd (schedule)
  → herald run (TypeScript CLI)
    → check budget (Anthropic API)
    → scan backlog (markdown files)
    → select task(s) by priority + budget fit
    → invoke `claude -p` with scoped permissions
    → capture JSON output
    → update backlog state
    → send iMessage summary
    → log to journal
```

## Project Structure

```
herald/
├── src/
│   ├── cli.ts              # Entry point (Commander-based)
│   ├── scheduler.ts         # launchd plist generation & management
│   ├── backlog/
│   │   ├── store.ts         # CRUD for backlog items (markdown files)
│   │   ├── parser.ts        # Parse markdown backlog items with YAML frontmatter
│   │   └── prioritizer.ts   # Sort/filter logic for task selection
│   ├── budget/
│   │   ├── tracker.ts       # Query Anthropic API for usage
│   │   └── policy.ts        # Decision logic: can we afford a run?
│   ├── runner/
│   │   ├── invoke.ts        # Spawn `claude -p` with constructed prompts
│   │   ├── prompts.ts       # Prompt templates for different task types
│   │   └── output.ts        # Parse claude JSON output
│   ├── notify/
│   │   ├── imessage.ts      # osascript-based iMessage sending
│   │   └── slack.ts         # Slack webhook fallback (deferred)
│   ├── journal/
│   │   └── logger.ts        # Run history logging
│   └── config.ts            # Configuration loading
├── backlog/
│   ├── templates/
│   │   ├── task.md
│   │   └── recurring.md
│   └── active/              # Current backlog items
├── journal/                  # Run logs (timestamped JSON)
├── CLAUDE.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**Tech stack:** TypeScript, Commander, vitest. Same patterns as the brain project.

## Backlog Format

Each backlog item is a markdown file with YAML frontmatter in `backlog/active/`:

```markdown
---
id: 2026-02-20-001
type: task | recurring | monitor
priority: high | medium | low
status: pending | in-progress | done | blocked
schedule: "0 9 * * *"          # cron expression (recurring only)
expires: 2026-03-01             # optional auto-archive date
project: ~/Documents/projects/brain  # working directory for claude
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
maxTokens: 50000
tags: [maintenance, brain]
created: 2026-02-20
lastRun: null
---

# Task title

## Context
Background information for Claude.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Notes
Additional guidance.
```

### Task Types

- **task** — one-off work item. Picked by priority, marked done when complete.
- **recurring** — repeats on a cron schedule. `lastRun` tracks when it last executed.
- **monitor** — recurring check that reports status but doesn't modify anything (e.g., stock portfolio check).

## Heartbeat Loop

The core loop, triggered by launchd or `herald run`:

1. **Load config** from `herald.config.json`
2. **Check budget**
   - Query Anthropic API usage for current billing period
   - Compare against configured limits
   - If over hard cap: send iMessage notification, exit
   - If over warning threshold: include warning in task prompt
3. **Scan backlog**
   - Read all `.md` files in `backlog/active/`
   - Filter: `status=pending` OR (`type=recurring` AND schedule is due)
   - Sort by priority (high > medium > low), then by created date
4. **Select task(s)**
   - Pick top task that fits within remaining budget
   - For recurring: compare `lastRun` against cron schedule
5. **Execute**
   - Update task status to `in-progress`
   - Construct prompt from task content + project CLAUDE.md
   - Invoke: `claude -p "<prompt>" --output-format json --allowedTools <scoped list>`
   - Capture output, parse results
   - Update task status (`done` or `blocked` based on output)
   - Log run to `journal/`
6. **Notify**
   - Compose summary of actions taken
   - Send via iMessage (primary)
   - Flag any items needing human input
7. **Backlog maintenance**
   - Archive done items older than 7 days
   - Flag stale pending items (>30 days)

## Budget Enforcement

Two layers of protection:

### Pre-run Gate

Before invoking Claude, query the Anthropic API for current billing period usage. If usage exceeds the configurable threshold, skip the run entirely.

### Per-task Cap

Each backlog item specifies `maxTokens`. Herald passes `--max-turns` to Claude Code to limit work per task. Tasks exceeding their cap get status `blocked`.

### Configuration

```json
{
  "budget": {
    "monthlyLimitUsd": 100,
    "warningThresholdPct": 70,
    "hardCapPct": 85,
    "defaultMaxTokensPerTask": 50000
  }
}
```

## Notifications

### iMessage (Primary)

Uses `osascript` to send via Messages.app. No API keys or accounts needed — works with the existing Apple ID on the Mac.

### Message Format

```
Herald Daily Report (2/20)

Completed:
- Refactored brain search (PR #12)

Skipped (budget):
- Add fuzzy matching (deferred)

Needs input:
- Brain: should stale notes auto-archive?

Budget: $42/$100 (42%)
```

### Slack (Deferred)

Simple webhook POST for richer formatting. Not in MVP.

## Brain Integration (Deferred)

Post-MVP, the brain project becomes the knowledge layer:

- **Before runs:** `brain search` for relevant context to include in prompts
- **After runs:** `brain add` to store session learnings
- **Recurring task:** Built-in item that runs `brain stale` to flag notes for review

## Scheduling

### launchd

Herald generates and manages its own launchd plist:

- Default: 3 runs per day (9am, 1pm, 6pm)
- Plist installed to `~/Library/LaunchAgents/com.herald.scheduler.plist`
- `herald schedule install` generates and loads the plist
- `herald schedule uninstall` removes it
- `herald schedule status` shows next scheduled run

### Configuration

Schedule is configurable in `herald.config.json`:

```json
{
  "schedule": {
    "times": ["09:00", "13:00", "18:00"],
    "timezone": "America/Los_Angeles"
  }
}
```

## CLI Commands

```
herald run              # Execute one heartbeat cycle
herald run --dry        # Show what would happen without executing

herald backlog add      # Create a new backlog item (interactive)
herald backlog list     # Show current backlog sorted by priority

herald schedule install  # Generate and load launchd plist
herald schedule uninstall # Remove launchd plist
herald schedule status   # Show next scheduled run

herald budget            # Show current usage vs limits
herald journal           # Show recent run history
herald notify test       # Send a test iMessage

herald config            # Show configuration
```

## MVP Scope

### Included

- `herald run` — core heartbeat loop
- `herald backlog add/list` — basic CRUD
- `herald schedule install/uninstall/status` — launchd management
- `herald budget` — usage checking via Anthropic API
- `herald notify` — iMessage notifications
- One built-in recurring task: backlog triage + usage report
- Journal logging (timestamped JSON files)

### Deferred

- Slack integration
- Brain project integration
- Multi-task parallel execution
- Rich prompt construction with brain context
- `herald backlog edit` (use $EDITOR directly)
- iMessage reply parsing (async question/answer flow)
- Monitor task type implementation
- Stock portfolio / personal check-in use cases (these become backlog items)

## Guardrails

- **Budget gate** prevents runaway costs
- **Per-task token caps** limit individual task spending
- **Scoped `--allowedTools`** per task restricts what Claude can do
- **Feature branch only** — Claude commits to feature branches, never main
- **Journal logging** — full audit trail of every run
- **Dry run mode** — `herald run --dry` for safe testing

## Evolution Path

1. **MVP** — scheduled heartbeat, backlog CRUD, budget gate, iMessage
2. **Brain integration** — context-enriched prompts, knowledge capture
3. **Async Q&A** — agent asks questions via iMessage, checks for replies on next heartbeat
4. **Monitor tasks** — stock portfolio, health metrics, etc.
5. **Multi-task runs** — parallel execution when budget allows
6. **Self-improvement** — agent adds its own backlog items based on patterns it notices
