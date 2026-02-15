import { describe, it, expect } from "vitest";
import { buildIntegratorPrompt } from "./integrator.js";

describe("buildIntegratorPrompt", () => {
  const completedTasks = [
    {
      taskId: "t1",
      title: "JWT utils",
      summary: "Added JWT generation",
      branchName: "oi/t1-jwt",
    },
    {
      taskId: "t2",
      title: "Auth middleware",
      summary: "Updated middleware",
      branchName: "oi/t2-middleware",
    },
  ];
  const repo = { owner: "acme", name: "api" };

  it("includes the goal", () => {
    const prompt = buildIntegratorPrompt("Refactor auth", completedTasks, repo);
    expect(prompt).toContain("Refactor auth");
  });

  it("includes repo info", () => {
    const prompt = buildIntegratorPrompt("Goal", completedTasks, repo);
    expect(prompt).toContain("acme");
    expect(prompt).toContain("api");
  });

  it("lists all completed task branches", () => {
    const prompt = buildIntegratorPrompt("Goal", completedTasks, repo);
    expect(prompt).toContain("oi/t1-jwt");
    expect(prompt).toContain("oi/t2-middleware");
    expect(prompt).toContain("JWT utils");
    expect(prompt).toContain("Auth middleware");
  });

  it("instructs to create a PR", () => {
    const prompt = buildIntegratorPrompt("Goal", completedTasks, repo);
    expect(prompt.toLowerCase()).toContain("pull request");
  });

  it("instructs to merge branches one at a time", () => {
    const prompt = buildIntegratorPrompt("Goal", completedTasks, repo);
    expect(prompt.toLowerCase()).toContain("one at a time");
  });

  it("instructs to run tests", () => {
    const prompt = buildIntegratorPrompt("Goal", completedTasks, repo);
    expect(prompt.toLowerCase()).toContain("run tests");
  });
});
