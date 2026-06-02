import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/cli.ts',
    'src/core/channel-server.ts',
    'src/plugins/diet/mcp/server.ts',
  ],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  dts: true,
});
