import type { BrainDriver, BrainEvent, Plugin } from "./contract.js";
import type { Registry } from "./registry.js";

/**
 * Driver selection per logical channel. Driver choice doubles as the security
 * boundary (e.g. keep coach chat on the cheap ChannelDriver, route isolated
 * triage to an SdkDriver), so it is resolved per channel with a default.
 */
export interface DriverMap {
  default: BrainDriver;
  byChannel?: Record<string, BrainDriver>;
}

export interface Router {
  /** The plugin that owns a logical channel, or undefined if none. */
  pluginForChannel(channel: string): Plugin | undefined;
  /** The driver that handles a logical channel (per-channel override ⇒ default). */
  driverForChannel(channel: string): BrainDriver;
  /**
   * Resolve the owning plugin and driver for `channel`, then invoke the driver.
   * Throws if no plugin owns the channel — transports should only deliver
   * events for channels a plugin has bound.
   */
  dispatch(channel: string, event: BrainEvent): Promise<void>;
}

export function createRouter(registry: Registry, drivers: DriverMap): Router {
  const driverForChannel = (channel: string): BrainDriver =>
    drivers.byChannel?.[channel] ?? drivers.default;

  return {
    pluginForChannel: (channel) => registry.pluginForChannel(channel),
    driverForChannel,
    async dispatch(channel, event) {
      const plugin = registry.pluginForChannel(channel);
      if (!plugin) {
        throw new Error(`No plugin owns channel "${channel}"`);
      }
      await driverForChannel(channel).handle(channel, event, plugin);
    },
  };
}
