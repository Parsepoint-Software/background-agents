import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { ProjectState, ProjectPhase } from "./types.js";

export function getProjectsDir(): string {
  return path.join(os.homedir(), ".open-inspect", "projects");
}

export function createProject(params: {
  goal: string;
  repo: { owner: string; name: string };
  plannerModel: string;
}): ProjectState {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    goal: params.goal,
    repo: params.repo,
    phase: "planning" as ProjectPhase,
    planning: {
      sessionId: null,
      model: params.plannerModel,
      status: "pending",
    },
    plan: null,
    tasks: {},
    integration: {
      sessionId: null,
      status: "pending",
      mergedBranch: null,
      prUrl: null,
    },
  };
}

export async function loadProject(id: string): Promise<ProjectState | null> {
  try {
    const data = await fs.readFile(path.join(getProjectsDir(), `${id}.json`), "utf-8");
    return JSON.parse(data) as ProjectState;
  } catch {
    return null;
  }
}

export async function saveProject(state: ProjectState): Promise<void> {
  const dir = getProjectsDir();
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${state.id}.json`);
  const tmpPath = `${filePath}.tmp`;
  state.updatedAt = Date.now();
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2) + "\n");
  await fs.rename(tmpPath, filePath);
}

export async function listProjects(): Promise<
  Array<{ id: string; goal: string; phase: string; updatedAt: number }>
> {
  const dir = getProjectsDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const results: Array<{
    id: string;
    goal: string;
    phase: string;
    updatedAt: number;
  }> = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue;
    try {
      const data = await fs.readFile(path.join(dir, entry), "utf-8");
      const project = JSON.parse(data) as ProjectState;
      results.push({
        id: project.id,
        goal: project.goal,
        phase: project.phase,
        updatedAt: project.updatedAt,
      });
    } catch {
      // Skip corrupt files
    }
  }
  return results.sort((a, b) => b.updatedAt - a.updatedAt);
}
