# Herald Migration Plan — from autonomous task-runner to conversational assistant harness

**Date:** 2026-05-28
**Status:** Draft — approved direction (pivot in place, keep name, backlog → future plugin)
**Relationship to other docs:** This is the *home + reuse* decision for the v0 design in `2026-05-28-v0-implementation.md`. Development moves from `~/Documents/projects/openclaw` (research/planning only) to **`~/Documents/projects/herald`** (the codebase).

---

## 1. Decision

- **Home:** pivot **`~/Documents/projects/herald`** in place. Keep the name, git history, GitHub remote (`HJewkes/herald`), and TS infra.
- **Name:** **Herald** — apt for a proactive messenger; supersedes the borrowed "openclaw" framing.
- **Backlog/autonomous-task concept:** **demote to a future plugin.** Not deleted, not in the v0 core path.
- **Package scope:** currently `@titan-design/herald`. Revisit scope at publish time (deferred).

> Herald already states our exact philosophy (design doc, 2026-02-20): *"Scheduling lives outside the agent — Herald triggers Claude Code, not the other way around. Clean separation: sidecar for orchestration, Claude Code for reasoning. Budget-first. Local-first."* The pivot is: **add the inbound/conversational half, repackage as a layered library, and abstract the driver — while keeping the hardened orchestration glue.**

---

## 2. What Herald already gives us (reuse map)

Verified by reading the source (2,360 LOC TS, ESM/Node22, tested, CI, security-hardened in git history).

### Keep ~as-is — the hardened, fiddly glue (the real value)
| File(s) | What it is | Maps to |
|---|---|---|
| `src/runner/{invoke,prompts,output}.ts` | spawns `claude -p --output-format json` with scoped `--allowedTools`; parses cost/tokens/`is_error`/needs-input | **`SdkDriver` (headless variant)** — nearly drop-in |
| `src/notify/imessage.ts` | osascript iMessage **send** + AppleScript escaping | iMessage transport (send half, per report 05) |
| `src/notify/slack.ts` | full `SlackClient`: postMessage, update, history, reactions, file upload, channel create, auth | Slack transport (send + the polling primitives) |
| `src/budget/tracker.ts` | weekly token pacing w/ buffer-day cap | cost control (the billing-discussion concern) |
| `src/lockfile.ts` | PID-based single-instance lock, stale detection | daemon single-instance safety |
| `src/journal/logger.ts` | timestamped run history | audit log substrate |
| `src/scheduler.ts` | launchd plist generation/install/status | scheduler (macOS path; systemd later on Proxmox) |
| `src/config.ts` | config load + deep-merge defaults | harness config loader |
| infra | tsup, vitest, eslint, `__tests__/` mirror, GitHub Actions, ESM/Node22 | keep wholesale |

### Reframe — demote to a future plugin (don't build core around these)
| File(s) | Why demote |
|---|---|
| `src/backlog/{parser,store,prioritizer}.ts` | the autonomous task-queue concept → `plugins/backlog/` later |
| `src/slack/{commands,state}.ts` | backlog-specific Slack command parser (`skip`/`unblock`/`priority`…) → belongs to the backlog plugin |
| backlog-centric fields in `src/types.ts` | `BacklogItem`, `TaskStatus`, etc. move with the plugin |

### Build new — the gaps (this is the actual work; report 06 confirmed these are *our* job)
| Gap | Note |
|---|---|
| **Inbound / conversational loop** | Herald is **push-only** (notifies, never converses). Need Slack **Socket Mode listener** (+ later chat.db reader). The two-way loop is net-new. |
| **Library packaging** | Herald is a CLI app; we need Layer-1 primitives + Layer-2 `createAssistant()` + starter template. |
| **Driver abstraction** | Herald hardcodes headless `claude -p`. Add the `BrainDriver` seam + **`ChannelDriver`** (persistent interactive CC + `claude/channel`). |
| **Plugin contract + transport interface** | `Plugin` / `BrainDriver` / `Transport` from the v0 plan. |
| **Allowlist + audit as PreToolUse hooks** | per report 06, ship these as hooks, not bespoke middleware. |

**Bottom line:** Herald supplies ~40% of the substrate — the unglamorous, already-debugged 40% (runner, notify, budget, lockfile, journal, scheduler, infra) — plus the proven architecture. The conversational loop, library shape, and driver/plugin abstractions are the build.

---

## 3. Target structure (restructure `src/` toward the v0 library shape)

```
herald/
  src/
    core/
      contract.ts        # Plugin / ScheduledJob / McpServerSpec / BrainDriver / BrainEvent / Transport
      registry.ts
      router.ts          # channel → plugin + channel → driver
      createAssistant.ts # Layer-2 convenience wrapper
      scheduler.ts       # ← from existing src/scheduler.ts (launchd) + cron-due logic
      budget.ts          # ← from existing src/budget/tracker.ts
      lockfile.ts        # ← keep
      journal.ts         # ← from existing src/journal/logger.ts  (becomes audit log)
      config.ts          # ← keep, de-backlog the schema
      hooks.ts           # NEW: PreToolUse allowlist + audit (report 06)
    drivers/
      base.ts            # BrainDriver protocol
      sdk.ts             # ← from existing src/runner/*  (claude -p headless)
      channel.ts         # NEW: persistent interactive CC + claude/channel
    transports/
      base.ts            # Transport protocol + InboundMsg
      slack.ts           # ← existing src/notify/slack.ts (send) + NEW Socket Mode listen
      imessage.ts        # ← existing src/notify/imessage.ts (send) + NEW chat.db read (later)
    channel-server.ts    # NEW: the claude/channel MCP capability
    cli.ts               # keep, slim to harness ops (start/schedule/status/budget/journal)
  plugins/
    diet/                # FIRST new plugin (v0 vertical)
    backlog/             # LATER: rehome existing backlog/ + slack/commands here
  templates/             # starter template (create-herald)
```

Migration is mostly **moving + renaming existing files** into this tree, then adding the NEW ones. Low-risk; the hardened code keeps its tests.

---

## 4. Migration sequence (folds into the v0 milestones)

| Step | Action | Risk |
|---|---|---|
| **S0** | Branch `feat/harness-pivot`. Move research from `openclaw/` into `herald/docs/` (or leave openclaw as the planning archive). | none |
| **S1** | Restructure `src/` per §3 — move runner→`drivers/sdk.ts`, notify→`transports/`, budget/lockfile/journal/scheduler/config→`core/`. Keep tests green. | low (mechanical) |
| **S2** | Quarantine backlog: move `backlog/` + `slack/commands.ts`+`state.ts` into `plugins/backlog/` (don't wire into core yet). De-backlog `types.ts`/`config.ts`. | low |
| **S3** | Add `core/contract.ts` (Plugin/BrainDriver/Transport/BrainEvent) + `core/registry.ts` + `core/router.ts`. | new code |
| **S4** | = **M0**. `SlackTransport.listen()` (Socket Mode) + allowlist hook + echo `#diet` round-trip. No brain yet. | new code |
| **S5** | = **M1**. `ChannelDriver` (default) wired to a persistent CC session; diet plugin's first tool (`log_meal`); audit hook. | new code |
| **S6+** | M2–M6 from the v0 plan (scheduler jobs, dynamic nag, restaurant reasoning, agnosticism proofs). | — |

---

## 5. Open items
- **Package scope** `@titan-design/herald` — keep or change before any publish? (deferred, non-blocking)
- **openclaw/ directory fate** — keep as planning archive, or move `research/` + `plans/` into `herald/docs/`? (recommend: copy the 6 research reports + the two v0/migration plans into `herald/docs/`, leave openclaw/ as-is for now.)
- **Slack vs iMessage for v0** — plan already favors Slack (Socket Mode = clean inbound + headless-friendly); Herald's `SlackClient` makes this even cheaper since send is done. iMessage send also exists if you want the native feel; inbound chat.db reader is the only missing piece.
- The existing **`claude -p` runner is the post-June-15 metered path** — fine for the `SdkDriver`/triage workload; the cheap default stays `ChannelDriver`.
```
