import { describe, it, expect } from "vitest";
import { createRegistry } from "../../src/core/registry.js";
import type { Plugin, ScheduledJob } from "../../src/core/contract.js";

function makePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: "diet",
    channels: ["diet"],
    skillDir: "/plugins/diet/skill",
    mcpServers: [],
    jobs: [],
    ...overrides,
  };
}

const job = (id: string, channel: string): ScheduledJob => ({
  id,
  cron: "0 9 * * *",
  kind: "fixed",
  payload: "Breakfast time",
  channel,
});

describe("createRegistry", () => {
  it("loads plugins by invoking each register()", () => {
    const diet = makePlugin();
    const registry = createRegistry([() => diet]);
    expect(registry.plugins).toEqual([diet]);
  });

  it("indexes plugins by channel and by name", () => {
    const diet = makePlugin();
    const workout = makePlugin({ name: "workout", channels: ["workout"] });
    const registry = createRegistry([() => diet, () => workout]);

    expect(registry.pluginForChannel("diet")).toBe(diet);
    expect(registry.pluginForChannel("workout")).toBe(workout);
    expect(registry.pluginByName("workout")).toBe(workout);
  });

  it("returns undefined for unknown channel or name", () => {
    const registry = createRegistry([() => makePlugin()]);
    expect(registry.pluginForChannel("nope")).toBeUndefined();
    expect(registry.pluginByName("nope")).toBeUndefined();
  });

  it("aggregates channels and jobs across all plugins", () => {
    const diet = makePlugin({ jobs: [job("d1", "diet")] });
    const workout = makePlugin({
      name: "workout",
      channels: ["workout", "workout-log"],
      jobs: [job("w1", "workout")],
    });
    const registry = createRegistry([() => diet, () => workout]);

    expect(registry.channels).toEqual(["diet", "workout", "workout-log"]);
    expect(registry.jobs.map((j) => j.id)).toEqual(["d1", "w1"]);
  });

  it("throws on duplicate plugin name", () => {
    expect(() =>
      createRegistry([
        () => makePlugin({ channels: ["a"] }),
        () => makePlugin({ channels: ["b"] }),
      ]),
    ).toThrow('Duplicate plugin name: "diet"');
  });

  it("throws when two plugins claim the same channel", () => {
    expect(() =>
      createRegistry([() => makePlugin(), () => makePlugin({ name: "other" })]),
    ).toThrow('Channel "diet" is claimed by both "diet" and "other"');
  });
});
