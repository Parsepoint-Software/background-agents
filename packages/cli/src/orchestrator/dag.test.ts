import { describe, it, expect } from "vitest";
import { validateDag, computeWaves, topologicalSort } from "./dag.js";
import type { TaskNode } from "../state/types.js";

function task(id: string, dependsOn: string[] = [], overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    fileScope: [`src/${id}/**`],
    dependsOn,
    complexity: "medium",
    ...overrides,
  };
}

describe("validateDag", () => {
  it("accepts a valid DAG with no dependencies", () => {
    const tasks = [task("t1"), task("t2"), task("t3")];
    const result = validateDag(tasks);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid DAG with linear dependencies", () => {
    const tasks = [task("t1"), task("t2", ["t1"]), task("t3", ["t2"])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a diamond DAG", () => {
    const tasks = [task("t1"), task("t2", ["t1"]), task("t3", ["t1"]), task("t4", ["t2", "t3"])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(true);
  });

  it("detects duplicate task IDs", () => {
    const tasks = [task("t1"), task("t1")];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Duplicate task ID"));
  });

  it("detects missing dependency references", () => {
    const tasks = [task("t1", ["t99"])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('depends on unknown task "t99"'));
  });

  it("detects a simple two-node cycle", () => {
    const tasks = [task("t1", ["t2"]), task("t2", ["t1"])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Cycle detected"));
  });

  it("detects a three-node cycle", () => {
    const tasks = [task("t1", ["t3"]), task("t2", ["t1"]), task("t3", ["t2"])];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining("Cycle detected"));
  });

  it("accepts an empty task list", () => {
    const result = validateDag([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a single task with no deps", () => {
    const result = validateDag([task("t1")]);
    expect(result.valid).toBe(true);
  });

  it("reports multiple errors at once", () => {
    const tasks = [task("t1", ["t99"]), task("t1")];
    const result = validateDag(tasks);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computeWaves", () => {
  it("puts independent tasks in wave 0", () => {
    const tasks = [task("t1"), task("t2"), task("t3")];
    const waves = computeWaves(tasks);
    expect(waves).toHaveLength(1);
    expect(waves[0].map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("separates dependent tasks into correct waves", () => {
    const tasks = [task("t1"), task("t2", ["t1"]), task("t3", ["t2"])];
    const waves = computeWaves(tasks);
    expect(waves).toHaveLength(3);
    expect(waves[0].map((t) => t.id)).toEqual(["t1"]);
    expect(waves[1].map((t) => t.id)).toEqual(["t2"]);
    expect(waves[2].map((t) => t.id)).toEqual(["t3"]);
  });

  it("computes a diamond DAG as 3 waves", () => {
    const tasks = [task("t1"), task("t2", ["t1"]), task("t3", ["t1"]), task("t4", ["t2", "t3"])];
    const waves = computeWaves(tasks);
    expect(waves).toHaveLength(3);
    expect(waves[0].map((t) => t.id)).toEqual(["t1"]);
    expect(waves[1].map((t) => t.id).sort()).toEqual(["t2", "t3"]);
    expect(waves[2].map((t) => t.id)).toEqual(["t4"]);
  });

  it("returns empty array for no tasks", () => {
    expect(computeWaves([])).toEqual([]);
  });

  it("handles complex DAG with mixed deps", () => {
    // t1 -> t3, t2 -> t3, t3 -> t4
    // t5 has no deps
    const tasks = [
      task("t1"),
      task("t2"),
      task("t3", ["t1", "t2"]),
      task("t4", ["t3"]),
      task("t5"),
    ];
    const waves = computeWaves(tasks);
    expect(waves).toHaveLength(3);
    expect(waves[0].map((t) => t.id).sort()).toEqual(["t1", "t2", "t5"]);
    expect(waves[1].map((t) => t.id)).toEqual(["t3"]);
    expect(waves[2].map((t) => t.id)).toEqual(["t4"]);
  });
});

describe("topologicalSort", () => {
  it("returns tasks in dependency order", () => {
    const tasks = [task("t3", ["t2"]), task("t2", ["t1"]), task("t1")];
    const sorted = topologicalSort(tasks);
    const ids = sorted.map((t) => t.id);
    expect(ids.indexOf("t1")).toBeLessThan(ids.indexOf("t2"));
    expect(ids.indexOf("t2")).toBeLessThan(ids.indexOf("t3"));
  });

  it("preserves all tasks", () => {
    const tasks = [task("t1"), task("t2"), task("t3")];
    const sorted = topologicalSort(tasks);
    expect(sorted.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("handles diamond DAG correctly", () => {
    const tasks = [task("t4", ["t2", "t3"]), task("t2", ["t1"]), task("t3", ["t1"]), task("t1")];
    const sorted = topologicalSort(tasks);
    const ids = sorted.map((t) => t.id);
    // t1 must come before t2, t3, and t4
    expect(ids.indexOf("t1")).toBeLessThan(ids.indexOf("t2"));
    expect(ids.indexOf("t1")).toBeLessThan(ids.indexOf("t3"));
    expect(ids.indexOf("t2")).toBeLessThan(ids.indexOf("t4"));
    expect(ids.indexOf("t3")).toBeLessThan(ids.indexOf("t4"));
  });

  it("returns empty for empty input", () => {
    expect(topologicalSort([])).toEqual([]);
  });
});
