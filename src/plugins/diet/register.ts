import type { Plugin } from "../../core/contract.js";

/**
 * Paths returned here are relative to the Herald project root; the session
 * launcher resolves them (it spawns MCP servers with cwd = project root and
 * reads `skillDir` for the session's `.claude/skills/`). Source artifacts
 * (SKILL.md, the SQLite file) live under the plugin; the built MCP server is
 * referenced from `dist/`.
 */
const PLUGIN_ROOT = "src/plugins/diet";

export function register(): Plugin {
  return {
    name: "diet",
    channels: ["diet"],
    skillDir: `${PLUGIN_ROOT}/skill`,
    mcpServers: [
      {
        name: "diet",
        command: ["node", "dist/plugins/diet/mcp/server.js"],
        env: { HERALD_DIET_DB: `${PLUGIN_ROOT}/data/diet.sqlite` },
      },
    ],
    jobs: [],
    allowedTools: ["mcp__diet__log_meal", "mcp__herald__reply"],
  };
}
