import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HeraldConfig } from "./types.js";

export const DEFAULT_CONFIG: HeraldConfig = {
  budget: {
    weeklyTokenLimit: 5000000,
    bufferDays: 1,
    defaultMaxTokensPerTask: 50000,
  },
  schedule: {
    times: ["09:00", "13:00", "18:00"],
    timezone: "America/Los_Angeles",
  },
  notify: {
    slack: {
      channel: "",
    },
  },
  backlogDir: "backlog/active",
  journalDir: "journal",
};

function validateConfig(config: Record<string, unknown>): HeraldConfig {
  const budget = config.budget;
  if (typeof budget !== "object" || budget === null) {
    throw new Error("Invalid config: budget must be an object");
  }
  const b = budget as Record<string, unknown>;
  if (typeof b.weeklyTokenLimit !== "number")
    throw new Error("Invalid config: budget.weeklyTokenLimit must be a number");
  if (typeof b.bufferDays !== "number")
    throw new Error("Invalid config: budget.bufferDays must be a number");
  if (typeof b.defaultMaxTokensPerTask !== "number")
    throw new Error(
      "Invalid config: budget.defaultMaxTokensPerTask must be a number",
    );

  const schedule = config.schedule;
  if (typeof schedule !== "object" || schedule === null) {
    throw new Error("Invalid config: schedule must be an object");
  }
  const s = schedule as Record<string, unknown>;
  if (!Array.isArray(s.times))
    throw new Error("Invalid config: schedule.times must be an array");
  if (typeof s.timezone !== "string")
    throw new Error("Invalid config: schedule.timezone must be a string");

  const notify = config.notify;
  if (typeof notify !== "object" || notify === null) {
    throw new Error("Invalid config: notify must be an object");
  }
  const n = notify as Record<string, unknown>;
  if (typeof n.slack !== "object" || n.slack === null) {
    throw new Error("Invalid config: notify.slack must be an object");
  }

  if (typeof config.backlogDir !== "string")
    throw new Error("Invalid config: backlogDir must be a string");
  if (typeof config.journalDir !== "string")
    throw new Error("Invalid config: journalDir must be a string");

  return config as unknown as HeraldConfig;
}

export function loadConfig(projectRoot: string): HeraldConfig {
  const configPath = join(projectRoot, "herald.config.json");
  let userConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      userConfig = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON in herald.config.json: ${msg}`);
    }
  }

  const merged = deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    userConfig,
  );
  const config = validateConfig(merged);
  config.backlogDir = join(projectRoot, config.backlogDir);
  config.journalDir = join(projectRoot, config.journalDir);

  return config;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      typeof target[key] === "object" &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
