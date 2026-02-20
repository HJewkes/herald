# Herald MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript CLI sidecar that schedules autonomous Claude Code execution with backlog management, budget enforcement, and iMessage notifications.

**Architecture:** Commander-based CLI (`herald`) following the brain project's patterns (ESM, tsup, vitest, Node16 modules). Core loop: launchd triggers `herald run` → check budget → scan markdown backlog → invoke `claude -p` → capture output → notify via iMessage → log to journal. All state lives on local filesystem.

**Tech Stack:** TypeScript, Commander + extra-typings, gray-matter (YAML frontmatter parsing), cron-parser (schedule evaluation), tsup, vitest, tsx.

## Dependency Graph

```
Task 1 (project scaffold) ──┐
                             ├─→ Task 3 (config)
Task 2 (types) ──────────────┤
                              ├─→ Task 4 (backlog parser)
                              ├─→ Task 5 (backlog store)  ←── Task 4
                              ├─→ Task 6 (prioritizer)    ←── Task 5
                              ├─→ Task 7 (budget tracker)
                              ├─→ Task 8 (iMessage notify)
                              ├─→ Task 9 (journal logger)
                              ├─→ Task 10 (runner/invoke)  ←── Task 3, 6, 7
                              ├─→ Task 11 (CLI commands)   ←── Task 5, 6, 7, 8, 9, 10
                              └─→ Task 12 (launchd scheduler) ←── Task 3
```

## Wave Plan

- **Wave 1** (parallel): Task 1 (scaffold), Task 2 (types)
- **Wave 2** (parallel, depends on Wave 1): Task 3 (config), Task 4 (backlog parser), Task 7 (budget tracker), Task 8 (iMessage notify), Task 9 (journal logger)
- **Wave 3** (parallel, depends on Wave 2): Task 5 (backlog store), Task 6 (prioritizer), Task 10 (runner/invoke), Task 12 (launchd scheduler)
- **Wave 4** (sequential, depends on Wave 3): Task 11 (CLI wiring + heartbeat loop)

## Tasks

| # | Name | Files | Wave | Depends On |
|---|------|-------|------|------------|
| 1 | Project scaffold | `package.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`, `CLAUDE.md` | 1 | — |
| 2 | Type definitions | `src/types.ts` | 1 | — |
| 3 | Config loader | `src/config.ts`, `__tests__/config.test.ts` | 2 | 1, 2 |
| 4 | Backlog parser | `src/backlog/parser.ts`, `__tests__/backlog/parser.test.ts` | 2 | 1, 2 |
| 5 | Backlog store | `src/backlog/store.ts`, `__tests__/backlog/store.test.ts` | 3 | 4 |
| 6 | Backlog prioritizer | `src/backlog/prioritizer.ts`, `__tests__/backlog/prioritizer.test.ts` | 3 | 5 |
| 7 | Budget tracker | `src/budget/tracker.ts`, `__tests__/budget/tracker.test.ts` | 2 | 1, 2 |
| 8 | iMessage notifier | `src/notify/imessage.ts`, `__tests__/notify/imessage.test.ts` | 2 | 1, 2 |
| 9 | Journal logger | `src/journal/logger.ts`, `__tests__/journal/logger.test.ts` | 2 | 1, 2 |
| 10 | Claude runner | `src/runner/invoke.ts`, `src/runner/prompts.ts`, `src/runner/output.ts`, `__tests__/runner/invoke.test.ts` | 3 | 3, 6, 7 |
| 11 | CLI commands + heartbeat | `src/cli.ts`, `src/commands/run.ts`, `src/commands/backlog.ts`, `src/commands/budget.ts`, `src/commands/journal.ts`, `src/commands/notify.ts`, `src/commands/schedule.ts`, `src/commands/config.ts` | 4 | 5, 6, 7, 8, 9, 10, 12 |
| 12 | launchd scheduler | `src/scheduler.ts`, `__tests__/scheduler.test.ts` | 3 | 3 |

Detailed task specs: `./briefings/task-NN.md`
