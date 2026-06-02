import { describe, it, expect } from "vitest";
import { register } from "../../../src/plugins/diet/register.js";

describe("diet register()", () => {
  it("declares the diet channel and a single diet MCP server", () => {
    const plugin = register();
    expect(plugin.name).toBe("diet");
    expect(plugin.channels).toEqual(["diet"]);
    expect(plugin.mcpServers.map((s) => s.name)).toEqual(["diet"]);
  });

  it("allows only the log_meal and reply tools", () => {
    expect(register().allowedTools).toEqual([
      "mcp__diet__log_meal",
      "mcp__herald__reply",
    ]);
  });

  it("declares no scheduled jobs in M1", () => {
    expect(register().jobs).toEqual([]);
  });
});
