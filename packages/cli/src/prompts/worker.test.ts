import { describe, it, expect } from "vitest";
import { buildWorkerPrompt, expectedBranchName, slugify } from "./worker.js";
import type { TaskNode } from "../state/types.js";

const baseTask: TaskNode = {
  id: "t1",
  title: "Add JWT utils",
  description: "Create JWT token generation and validation utilities",
  fileScope: ["src/auth/**"],
  dependsOn: [],
  complexity: "medium",
};

describe("buildWorkerPrompt", () => {
  it("includes the task title and description", () => {
    const prompt = buildWorkerPrompt(baseTask, []);
    expect(prompt).toContain("Add JWT utils");
    expect(prompt).toContain("Create JWT token generation");
  });

  it("includes the file scope", () => {
    const prompt = buildWorkerPrompt(baseTask, []);
    expect(prompt).toContain("src/auth/**");
  });

  it("includes the task ID and complexity", () => {
    const prompt = buildWorkerPrompt(baseTask, []);
    expect(prompt).toContain("t1");
    expect(prompt).toContain("medium");
  });

  it("omits dependency context when no deps", () => {
    const prompt = buildWorkerPrompt(baseTask, []);
    expect(prompt).not.toContain("Completed Dependencies");
  });

  it("includes dependency context when deps are provided", () => {
    const prompt = buildWorkerPrompt(baseTask, [
      {
        taskId: "t0",
        summary: "Set up the project structure",
        branchName: "oi/t0-setup",
      },
    ]);
    expect(prompt).toContain("Completed Dependencies");
    expect(prompt).toContain("t0");
    expect(prompt).toContain("oi/t0-setup");
    expect(prompt).toContain("Set up the project structure");
  });

  it("instructs worker not to merge other branches", () => {
    const prompt = buildWorkerPrompt(baseTask, []);
    expect(prompt.toLowerCase()).toContain("do not merge");
  });

  it("includes branch creation and push instructions", () => {
    const prompt = buildWorkerPrompt(baseTask, []);
    expect(prompt).toContain("oi/t1-add-jwt-utils");
    expect(prompt).toContain("git push");
  });
});

describe("expectedBranchName", () => {
  it("generates branch name from task id and slugified title", () => {
    expect(expectedBranchName(baseTask)).toBe("oi/t1-add-jwt-utils");
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("truncates to 40 characters", () => {
    const long = "a".repeat(50);
    expect(slugify(long).length).toBe(40);
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--foo--")).toBe("foo");
  });
});
