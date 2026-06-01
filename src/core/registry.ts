import type { Plugin, Register, ScheduledJob } from "./contract.js";

export interface Registry {
  /** All loaded plugins, in registration order. */
  readonly plugins: Plugin[];
  /** Every logical channel claimed across all plugins. */
  readonly channels: string[];
  /** Every scheduled job declared across all plugins. */
  readonly jobs: ScheduledJob[];
  /** The plugin that owns a logical channel, or undefined if none. */
  pluginForChannel(channel: string): Plugin | undefined;
  /** A plugin by its unique name, or undefined if none. */
  pluginByName(name: string): Plugin | undefined;
}

/**
 * Load plugins by invoking each module's `register()` and index them for the
 * router. Channels are exclusive: at most one plugin may own a logical channel,
 * and plugin names must be unique — either conflict throws.
 */
export function createRegistry(registers: Register[]): Registry {
  const plugins: Plugin[] = [];
  const byName = new Map<string, Plugin>();
  const byChannel = new Map<string, Plugin>();

  for (const register of registers) {
    const plugin = register();

    if (byName.has(plugin.name)) {
      throw new Error(`Duplicate plugin name: "${plugin.name}"`);
    }
    byName.set(plugin.name, plugin);

    for (const channel of plugin.channels) {
      const owner = byChannel.get(channel);
      if (owner) {
        throw new Error(
          `Channel "${channel}" is claimed by both "${owner.name}" and "${plugin.name}"`,
        );
      }
      byChannel.set(channel, plugin);
    }

    plugins.push(plugin);
  }

  return {
    plugins,
    channels: [...byChannel.keys()],
    jobs: plugins.flatMap((p) => p.jobs),
    pluginForChannel: (channel) => byChannel.get(channel),
    pluginByName: (name) => byName.get(name),
  };
}
