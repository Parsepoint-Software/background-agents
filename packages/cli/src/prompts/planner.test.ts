import { describe, it, expect } from "vitest";
import { buildPlannerPrompt } from "./planner.js";

describe("buildPlannerPrompt", () => {
  it("includes the repo owner and name", () => {
    const prompt = buildPlannerPrompt("Add tests", {
      owner: "acme",
      name: "widget",
    });
    expect(prompt).toContain("acme");
    expect(prompt).toContain("widget");
  });

  it("includes the goal", () => {
    const prompt = buildPlannerPrompt("Refactor auth to use JWT", {
      owner: "o",
      name: "r",
    });
    expect(prompt).toContain("Refactor auth to use JWT");
  });

  it("includes JSON schema example", () => {
    const prompt = buildPlannerPrompt("Goal", { owner: "o", name: "r" });
    expect(prompt).toContain('"tasks"');
    expect(prompt).toContain('"dependsOn"');
    expect(prompt).toContain('"fileScope"');
  });

  it("instructs minimizing dependencies", () => {
    const prompt = buildPlannerPrompt("Goal", { owner: "o", name: "r" });
    expect(prompt.toLowerCase()).toContain("minimize dependencies");
  });

  it("instructs non-overlapping file scopes", () => {
    const prompt = buildPlannerPrompt("Goal", { owner: "o", name: "r" });
    expect(prompt.toLowerCase()).toContain("non-overlapping");
  });
});
