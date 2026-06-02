import { describe, it, expect, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDietDb } from "../../../src/plugins/diet/db.js";

const TS = "2026-06-02T17:30:00.000Z";

const tmpDirs: string[] = [];
function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "herald-diet-"));
  tmpDirs.push(dir);
  return join(dir, "diet.sqlite");
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("openDietDb", () => {
  it("logs a meal and returns an incrementing id", () => {
    const db = openDietDb(":memory:");

    const first = db.logMeal({ meal: "breakfast", description: "eggs" }, TS);
    const second = db.logMeal({ meal: "lunch", description: "salad" }, TS);

    expect(first).toBe(1);
    expect(second).toBe(2);
    db.close();
  });

  it("persists meal fields and the timestamp", () => {
    const path = tmpDbPath();
    const db = openDietDb(path);
    const id = db.logMeal(
      { meal: "dinner", description: "pasta", onPlan: false },
      TS,
    );
    db.close();

    const reader = new DatabaseSync(path);
    const row = reader.prepare("SELECT * FROM food_log WHERE id = ?").get(id);
    reader.close();

    expect(row).toEqual({
      id,
      ts: TS,
      meal: "dinner",
      description: "pasta",
      on_plan: 0,
    });
  });

  it("stores on_plan as 1, 0, or null", () => {
    const path = tmpDbPath();
    const db = openDietDb(path);
    db.logMeal({ meal: "a", description: "x", onPlan: true }, TS);
    db.logMeal({ meal: "b", description: "y", onPlan: false }, TS);
    db.logMeal({ meal: "c", description: "z" }, TS);
    db.close();

    const reader = new DatabaseSync(path);
    const onPlan = reader
      .prepare("SELECT on_plan FROM food_log ORDER BY id")
      .all()
      .map((r) => (r as { on_plan: number | null }).on_plan);
    reader.close();

    expect(onPlan).toEqual([1, 0, null]);
  });
});
