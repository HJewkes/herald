# Task 01: Project Scaffold

## Architectural Context

Herald is a new TypeScript CLI project at `~/Documents/projects/herald/`. It follows the exact same patterns as the brain project (`~/Documents/projects/brain/`): ESM-only, Commander CLI, tsup build, vitest tests, tsx for dev. The repo already exists with a git init and one commit (design doc in `docs/plans/`).

## File Ownership

**May modify:**
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `tsup.config.ts`
- `.gitignore`
- `CLAUDE.md`
- `backlog/templates/task.md`
- `backlog/templates/recurring.md`
- `backlog/active/.gitkeep`
- `journal/.gitkeep`

**Must not touch:**
- `docs/plans/` (existing design doc)

**Read for context (do not modify):**
- `~/Documents/projects/brain/package.json` — reference for package.json structure
- `~/Documents/projects/brain/tsconfig.json` — reference for tsconfig
- `~/Documents/projects/brain/vitest.config.ts` — reference for vitest config

## Steps

### Step 1: Create package.json

```json
{
  "name": "@titan-design/herald",
  "version": "0.1.0",
  "type": "module",
  "description": "Autonomous scheduled Claude Code agent with backlog management",
  "license": "MIT",
  "bin": {
    "herald": "dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src __tests__ --no-error-on-unmatched-pattern",
    "format": "prettier --write \"src/**/*.ts\" \"__tests__/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"__tests__/**/*.ts\""
  },
  "dependencies": {
    "@commander-js/extra-typings": "^13.1.0",
    "commander": "^13.1.0",
    "cron-parser": "^4.9.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@eslint/js": "^9.20.0",
    "@types/node": "^22.13.4",
    "eslint": "^9.20.0",
    "prettier": "^3.8.1",
    "tsup": "^8.3.6",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.24.1",
    "vitest": "^3.0.5"
  },
  "engines": {
    "node": ">=22"
  }
}
```

### Step 2: Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

### Step 3: Create vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['__tests__/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

### Step 4: Create tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  dts: true,
});
```

### Step 5: Create .gitignore

```
node_modules/
dist/
*.tsbuildinfo
journal/*.json
herald.config.json
```

### Step 6: Create CLAUDE.md

```markdown
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
```

### Step 7: Create backlog templates and directories

Create `backlog/templates/task.md`:
```markdown
---
id: YYYY-MM-DD-NNN
type: task
priority: medium
status: pending
project: ~/Documents/projects/example
allowedTools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
maxTokens: 50000
tags: []
created: YYYY-MM-DD
lastRun: null
---

# Task title

## Context
Background information for Claude.

## Acceptance Criteria
- [ ] Criterion 1

## Notes
Additional guidance.
```

Create `backlog/templates/recurring.md`:
```markdown
---
id: YYYY-MM-DD-NNN
type: recurring
priority: medium
status: pending
schedule: "0 9 * * *"
project: ~/Documents/projects/example
allowedTools:
  - Read
  - Grep
  - Glob
maxTokens: 30000
tags: []
created: YYYY-MM-DD
lastRun: null
---

# Recurring task title

## Context
What this recurring check does and why.

## Acceptance Criteria
- [ ] Check completed successfully
- [ ] Report generated

## Notes
Additional guidance.
```

Create `backlog/active/.gitkeep` and `journal/.gitkeep` (empty files).

### Step 8: Create minimal src/cli.ts placeholder

```typescript
#!/usr/bin/env node
import { Command } from '@commander-js/extra-typings';

const program = new Command()
  .name('herald')
  .description('Autonomous scheduled Claude Code agent')
  .version('0.1.0');

program.parseAsync().catch((err: Error) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 1;
});
```

### Step 9: Install dependencies

Run: `npm install`
Expected: Clean install with no errors.

### Step 10: Verify

Run: `npm run typecheck`
Expected: No errors.

### Step 11: Commit

```bash
git add package.json tsconfig.json vitest.config.ts tsup.config.ts .gitignore CLAUDE.md backlog/ journal/ src/cli.ts
git commit -m "Add project scaffold with Commander CLI, tsup, vitest"
```

## Success Criteria

- [ ] `npm install` succeeds
- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` produces `dist/cli.js`
- [ ] `node dist/cli.js --help` shows herald CLI help

## Anti-patterns

- Do NOT modify files outside the ownership list above
- Do NOT modify CLAUDE.md or any persistent configuration files (outside this project)
- Do NOT add features beyond what is specified in the steps
- Do NOT add eslint config or prettier config (handled later if needed)
