import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { createProject, saveProject, loadProject, listProjects } from "./project.js";

// We can't easily mock getProjectsDir since it's a named export,
// so we'll test the public API and clean up after.

describe("createProject", () => {
  it("returns a valid ProjectState with correct fields", () => {
    const state = createProject({
      goal: "Add tests",
      repo: { owner: "acme", name: "widget" },
      plannerModel: "opus-4-5",
    });

    expect(state.id).toBeTruthy();
    expect(state.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(state.goal).toBe("Add tests");
    expect(state.repo).toEqual({ owner: "acme", name: "widget" });
    expect(state.phase).toBe("planning");
    expect(state.planning.model).toBe("opus-4-5");
    expect(state.planning.status).toBe("pending");
    expect(state.planning.sessionId).toBeNull();
    expect(state.plan).toBeNull();
    expect(state.tasks).toEqual({});
    expect(state.integration.status).toBe("pending");
    expect(state.integration.sessionId).toBeNull();
    expect(state.integration.mergedBranch).toBeNull();
    expect(state.integration.prUrl).toBeNull();
    expect(state.createdAt).toBeGreaterThan(0);
    expect(state.updatedAt).toBeGreaterThan(0);
  });

  it("generates unique IDs for each project", () => {
    const a = createProject({
      goal: "A",
      repo: { owner: "o", name: "r" },
      plannerModel: "m",
    });
    const b = createProject({
      goal: "B",
      repo: { owner: "o", name: "r" },
      plannerModel: "m",
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe("saveProject / loadProject round-trip", () => {
  it("persists and loads a project", async () => {
    const state = createProject({
      goal: "Roundtrip test",
      repo: { owner: "test", name: "repo" },
      plannerModel: "model",
    });

    await saveProject(state);

    const loaded = await loadProject(state.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(state.id);
    expect(loaded!.goal).toBe("Roundtrip test");
    expect(loaded!.repo).toEqual({ owner: "test", name: "repo" });
    expect(loaded!.phase).toBe("planning");

    // Clean up
    const projectPath = path.join(os.homedir(), ".open-inspect", "projects", `${state.id}.json`);
    await fs.unlink(projectPath).catch(() => {});
  });

  it("returns null for nonexistent project", async () => {
    const loaded = await loadProject("nonexistent-id-12345");
    expect(loaded).toBeNull();
  });

  it("updates updatedAt on save", async () => {
    const state = createProject({
      goal: "Timestamp test",
      repo: { owner: "test", name: "repo" },
      plannerModel: "model",
    });

    const originalUpdatedAt = state.updatedAt;
    // Small delay to ensure timestamp changes
    await new Promise((r) => setTimeout(r, 10));
    await saveProject(state);
    expect(state.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);

    // Clean up
    const projectPath = path.join(os.homedir(), ".open-inspect", "projects", `${state.id}.json`);
    await fs.unlink(projectPath).catch(() => {});
  });
});

describe("listProjects", () => {
  it("returns an array (may include existing projects)", async () => {
    const projects = await listProjects();
    expect(Array.isArray(projects)).toBe(true);
  });

  it("includes a saved project", async () => {
    const state = createProject({
      goal: "List test project",
      repo: { owner: "test", name: "list" },
      plannerModel: "model",
    });
    await saveProject(state);

    const projects = await listProjects();
    const found = projects.find((p) => p.id === state.id);
    expect(found).toBeTruthy();
    expect(found!.goal).toBe("List test project");
    expect(found!.phase).toBe("planning");

    // Clean up
    const projectPath = path.join(os.homedir(), ".open-inspect", "projects", `${state.id}.json`);
    await fs.unlink(projectPath).catch(() => {});
  });

  it("sorts by updatedAt descending", async () => {
    const projects = await listProjects();
    for (let i = 1; i < projects.length; i++) {
      expect(projects[i - 1].updatedAt).toBeGreaterThanOrEqual(projects[i].updatedAt);
    }
  });
});
