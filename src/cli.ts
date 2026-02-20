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
