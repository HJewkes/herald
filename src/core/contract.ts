/**
 * The plugin contract — the only core module a plugin may import.
 *
 * A plugin declares itself (channels, MCP servers, skill, scheduled jobs);
 * the harness consumes the declaration. Nothing in core/ imports anything
 * from plugins/, and plugins/ import only this module. If both hold, the
 * harness is genuinely use-case agnostic.
 */

/** A unit of scheduled work a plugin declares. */
export interface ScheduledJob {
  id: string;
  /** Cron expression (the scheduler installs it). */
  cron: string;
  /**
   * `fixed`: the scheduler posts `payload` verbatim to the channel — no brain,
   * no cost. `dynamic`: `payload` is a prompt handed to the brain driver.
   */
  kind: "fixed" | "dynamic";
  payload: string;
  /** Logical channel the job acts on. */
  channel: string;
}

/** How to launch a plugin's stdio MCP server. */
export interface McpServerSpec {
  name: string;
  command: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/** A plugin's full declaration to the harness. */
export interface Plugin {
  name: string;
  /** Logical channels this plugin binds, e.g. ["diet"]. */
  channels: string[];
  /** Folder containing SKILL.md. */
  skillDir: string;
  mcpServers: McpServerSpec[];
  jobs: ScheduledJob[];
  systemPromptExtra?: string;
  model?: string;
  /** Optional subset restricting which tools the brain may call for this plugin. */
  allowedTools?: string[];
}

/** Each plugin module exposes a `register` of this shape. */
export type Register = () => Plugin;

/**
 * What the brain reacts to. Fixed scheduled jobs never reach a driver — only
 * inbound messages and dynamic scheduled prompts do.
 */
export type BrainEvent =
  | { kind: "message"; text: string; sender: string; threadId?: string }
  | { kind: "scheduled"; jobId: string; prompt: string };

/**
 * The swappable brain. The only part that differs between the
 * subscription-channel path (ChannelDriver) and the metered-SDK path
 * (SdkDriver). The router resolves the owning plugin and passes it in.
 */
export interface BrainDriver {
  handle(channel: string, event: BrainEvent, plugin: Plugin): Promise<void>;
}

/** A normalized inbound message from a transport (physical channel). */
export interface InboundMsg {
  channel: string;
  text: string;
  sender: string;
  ts: string;
  threadId?: string;
}

/** A channel adapter (Slack, iMessage, …). */
export interface Transport {
  send(channel: string, text: string, threadId?: string): Promise<void>;
  listen(handler: (msg: InboundMsg) => Promise<void>): Promise<void>;
}
