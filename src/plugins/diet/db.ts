import { DatabaseSync } from "node:sqlite";

/** A meal the user reported (free text, optionally flagged on/off plan). */
export interface MealEntry {
  meal: string;
  description: string;
  onPlan?: boolean;
}

/** The diet plugin's storage surface. M1 needs only the capture path. */
export interface DietDb {
  /** Append a meal to the log; returns the new row id. */
  logMeal(entry: MealEntry, ts: string): number;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  meal TEXT NOT NULL,
  description TEXT NOT NULL,
  on_plan INTEGER
);
`;

/**
 * Open (creating if needed) the diet SQLite database and ensure the schema.
 * Pass `:memory:` for an ephemeral in-process database (used in tests).
 */
export function openDietDb(path: string): DietDb {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  return {
    logMeal(entry, ts) {
      const onPlan = entry.onPlan === undefined ? null : entry.onPlan ? 1 : 0;
      const stmt = db.prepare(
        "INSERT INTO food_log (ts, meal, description, on_plan) VALUES (?, ?, ?, ?)",
      );
      const info = stmt.run(ts, entry.meal, entry.description, onPlan);
      return Number(info.lastInsertRowid);
    },
    close() {
      db.close();
    },
  };
}
