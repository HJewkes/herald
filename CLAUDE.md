# Herald

Autonomous scheduled Claude Code agent with backlog management, budget enforcement, and iMessage notifications.

## Architecture

- `src/cli.ts` — Commander CLI entry point
- `src/commands/` — CLI command handlers
- `src/backlog/` — Backlog parsing, storage, and prioritization
- `src/budget/` — Anthropic API usage tracking and budget policy
- `src/runner/` — Claude Code invocation and output parsing
- `src/notify/` — iMessage (and future Slack) notifications
- `src/journal/` — Run history logging
- `src/scheduler.ts` — launchd plist generation
- `src/config.ts` — Configuration loading
- `src/types.ts` — Shared type definitions

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
