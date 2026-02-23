import { describe, it, expect, vi, beforeEach } from "vitest";
import { BacklogStore, generateTaskId } from "../../src/backlog/store.js";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

const ITEM_CONTENT = `---
id: test-001
type: task
priority: high
status: pending
created: 2026-02-20
lastRun: null
---

# Test task

## Context
Test context.
`;

describe("BacklogStore", () => {
  let store: BacklogStore;

  beforeEach(() => {
    vi.resetAllMocks();
    store = new BacklogStore("/fake/backlog/active");
  });

  it("lists all markdown files as backlog items", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "task-001.md",
      "task-002.md",
      ".gitkeep",
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    const { items } = store.list();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe("test-001");
  });

  it("ignores non-markdown files", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      ".gitkeep",
      "notes.txt",
    ] as unknown as ReturnType<typeof readdirSync>);
    const { items } = store.list();
    expect(items).toHaveLength(0);
  });

  it("returns empty result when directory does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = store.list();
    expect(result).toEqual({ items: [], warnings: [] });
  });

  it("skips malformed files and reports warnings", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "good.md",
      "bad.md",
    ] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(ITEM_CONTENT)
      .mockReturnValueOnce("not valid frontmatter {{{{");
    const { items, warnings } = store.list();
    expect(items).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("bad.md");
  });

  it("updates item status in frontmatter", () => {
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    store.updateStatus("/fake/backlog/active/task-001.md", "done");
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain("status: done");
  });

  it("updates lastRun timestamp", () => {
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    store.updateLastRun(
      "/fake/backlog/active/task-001.md",
      "2026-02-20T12:00:00Z",
    );
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain("lastRun: '2026-02-20T12:00:00Z'");
  });

  it("updates priority in frontmatter", () => {
    vi.mocked(readFileSync).mockReturnValue(ITEM_CONTENT);
    store.updatePriority("/fake/backlog/active/task-001.md", "low");
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain("priority: low");
  });

  it("creates a new task file with correct front matter", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const filePath = store.create({
      id: "2026-02-22-001",
      title: "New task",
      priority: "high",
      tags: ["auth"],
      created: "2026-02-22",
    });

    expect(filePath).toBe("/fake/backlog/active/2026-02-22-001.md");
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
    const written = vi.mocked(writeFileSync).mock.calls[0][1] as string;
    expect(written).toContain("id: 2026-02-22-001");
    expect(written).toContain("type: task");
    expect(written).toContain("priority: high");
    expect(written).toContain("status: pending");
    expect(written).toContain("# New task");
  });

  it("creates directory if it does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    store.create({
      id: "2026-02-22-001",
      title: "Task",
      priority: "medium",
      tags: [],
      created: "2026-02-22",
    });

    expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith("/fake/backlog/active", {
      recursive: true,
    });
  });
});

describe("generateTaskId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 001 when no files exist for that date", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(
      [] as unknown as ReturnType<typeof readdirSync>,
    );
    const id = generateTaskId(
      "/fake/backlog",
      new Date("2026-02-22T12:00:00Z"),
    );
    expect(id).toBe("2026-02-22-001");
  });

  it("returns 002 when one file for that date exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "2026-02-22-001.md",
    ] as unknown as ReturnType<typeof readdirSync>);
    const id = generateTaskId(
      "/fake/backlog",
      new Date("2026-02-22T12:00:00Z"),
    );
    expect(id).toBe("2026-02-22-002");
  });

  it("ignores files from other dates", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "2026-02-21-001.md",
      "2026-02-21-002.md",
    ] as unknown as ReturnType<typeof readdirSync>);
    const id = generateTaskId(
      "/fake/backlog",
      new Date("2026-02-22T12:00:00Z"),
    );
    expect(id).toBe("2026-02-22-001");
  });

  it("returns 001 when directory does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const id = generateTaskId(
      "/fake/backlog",
      new Date("2026-02-22T12:00:00Z"),
    );
    expect(id).toBe("2026-02-22-001");
  });

  it("handles gaps from deleted files by using max suffix", () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      "2026-02-22-001.md",
      "2026-02-22-003.md",
    ] as unknown as ReturnType<typeof readdirSync>);
    const id = generateTaskId(
      "/fake/backlog",
      new Date("2026-02-22T12:00:00Z"),
    );
    expect(id).toBe("2026-02-22-004");
  });
});
