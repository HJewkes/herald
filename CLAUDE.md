# Herald

A use-case-agnostic, library-first TypeScript harness that adds chat + channels + scheduling + a swappable brain driver + plugin packaging around a Claude brain. Powers proactive personal-assistant verticals (diet coach, etc.); business logic lives in plugins, the brain stays thin.

> **In transition.** Pivoting from the original "autonomous scheduled task-runner" CLI into the harness above. The autonomous-backlog concept is being demoted to a future `plugins/backlog/`. See `docs/plans/2026-05-28-herald-migration.md` and `docs/plans/2026-05-28-v0-implementation.md` for the target architecture and milestones; `docs/research/` holds the supporting research (reports 00–06).

## Architecture

The S1 restructure is done — hardened orchestration glue now lives under `core/`, `drivers/`, `transports/`. Upcoming layers (`core/contract.ts`, `registry.ts`, `router.ts`, `createAssistant.ts`, `hooks.ts`, `drivers/channel.ts`, inbound transports, `plugins/`) are not built yet.

- `src/core/` — harness internals: `config`, `scheduler` (launchd plist), `budget` (token pacing), `journal` (run history), `lockfile` (single-instance)
- `src/drivers/` — swappable brain drivers; `sdk/` = headless `claude -p` invoker + prompt/output parsing (the `SdkDriver`)
- `src/transports/` — channel adapters: `imessage.ts` (osascript send), `slack.ts` (full Slack client; Socket Mode inbound upcoming)
- `src/cli.ts` — Commander CLI entry point
- `src/commands/` — CLI command handlers
- `src/types.ts` — Shared type definitions (still backlog-flavored; decouples in a later step)
- `src/backlog/`, `src/slack/` — legacy autonomous-task code, slated to move to `plugins/backlog/` (S2)

Tests in `__tests__/` mirror `src/` structure.

## Conventions

- ESM-only (`"type": "module"`)
- Node16 module resolution — all imports use `.js` extensions
- Tests in `__tests__/` mirroring `src/` structure
- Vitest with globals enabled
- Commander with `@commander-js/extra-typings`

## Commands

```bash
npm run dev -- <command>     # Run CLI in dev mode
npm test                     # Run tests
npm run typecheck            # Type check
npm run build                # Build with tsup
```
