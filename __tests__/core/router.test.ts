import { describe, it, expect, vi } from "vitest";
import { createRouter } from "../../src/core/router.js";
import { createRegistry } from "../../src/core/registry.js";
import type {
  BrainDriver,
  BrainEvent,
  Plugin,
} from "../../src/core/contract.js";

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

function fakeDriver(): BrainDriver & { handle: ReturnType<typeof vi.fn> } {
  return { handle: vi.fn().mockResolvedValue(undefined) };
}

const message: BrainEvent = { kind: "message", text: "had eggs", sender: "U1" };

describe("createRouter", () => {
  it("resolves the owning plugin for a channel", () => {
    const diet = makePlugin();
    const registry = createRegistry([() => diet]);
    const router = createRouter(registry, { default: fakeDriver() });

    expect(router.pluginForChannel("diet")).toBe(diet);
    expect(router.pluginForChannel("nope")).toBeUndefined();
  });

  it("uses the per-channel driver override when present, else the default", () => {
    const registry = createRegistry([
      () => makePlugin(),
      () => makePlugin({ name: "triage", channels: ["triage"] }),
    ]);
    const def = fakeDriver();
    const triageDriver = fakeDriver();
    const router = createRouter(registry, {
      default: def,
      byChannel: { triage: triageDriver },
    });

    expect(router.driverForChannel("diet")).toBe(def);
    expect(router.driverForChannel("triage")).toBe(triageDriver);
  });

  it("dispatch invokes the resolved driver with channel, event, and plugin", async () => {
    const diet = makePlugin();
    const registry = createRegistry([() => diet]);
    const driver = fakeDriver();
    const router = createRouter(registry, { default: driver });

    await router.dispatch("diet", message);

    expect(driver.handle).toHaveBeenCalledOnce();
    expect(driver.handle).toHaveBeenCalledWith("diet", message, diet);
  });

  it("dispatch routes to the per-channel driver override", async () => {
    const registry = createRegistry([
      () => makePlugin({ name: "triage", channels: ["triage"] }),
    ]);
    const def = fakeDriver();
    const triageDriver = fakeDriver();
    const router = createRouter(registry, {
      default: def,
      byChannel: { triage: triageDriver },
    });

    await router.dispatch("triage", message);

    expect(triageDriver.handle).toHaveBeenCalledOnce();
    expect(def.handle).not.toHaveBeenCalled();
  });

  it("dispatch throws when no plugin owns the channel", async () => {
    const registry = createRegistry([() => makePlugin()]);
    const driver = fakeDriver();
    const router = createRouter(registry, { default: driver });

    await expect(router.dispatch("unknown", message)).rejects.toThrow(
      'No plugin owns channel "unknown"',
    );
    expect(driver.handle).not.toHaveBeenCalled();
  });
});
