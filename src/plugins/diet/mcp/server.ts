import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDietDb } from "../db.js";

/**
 * The diet plugin's stdio MCP server. Claude Code (or the SDK driver) spawns it
 * and exposes its tools as `mcp__diet__*`. M1 ships only the capture path:
 * `log_meal`. The database path comes from HERALD_DIET_DB or the first argv.
 */
const dbPath = process.env.HERALD_DIET_DB ?? process.argv[2];
if (!dbPath) {
  console.error("diet MCP server: set HERALD_DIET_DB or pass a db path argument");
  process.exit(1);
}

const db = openDietDb(dbPath);

const server = new McpServer({ name: "diet", version: "0.1.0" });

server.registerTool(
  "log_meal",
  {
    description:
      "Record a meal the user reported eating. Capture their words faithfully; never invent macros or quantities they did not state.",
    inputSchema: {
      meal: z
        .string()
        .describe("Which meal: breakfast, lunch, dinner, or snack"),
      description: z
        .string()
        .describe("Free-text description of what was eaten, in the user's words"),
      on_plan: z
        .boolean()
        .optional()
        .describe("Whether it fit the user's plan, only if clearly known"),
    },
  },
  async ({ meal, description, on_plan }) => {
    const id = db.logMeal(
      { meal, description, onPlan: on_plan },
      new Date().toISOString(),
    );
    return {
      content: [{ type: "text", text: `Logged ${meal} (#${id}): ${description}` }],
    };
  },
);

await server.connect(new StdioServerTransport());
