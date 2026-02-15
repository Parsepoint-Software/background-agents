/**
 * `oi status` command — show project state and optionally resume.
 */

import { Command } from "commander";
import { loadProject, listProjects } from "../state/project.js";
import type { ProjectState } from "../state/types.js";
import * as logger from "../ui/logger.js";

export function statusCommand(): Command {
  const cmd = new Command("status")
    .description("Show project status")
    .argument("[id]", "Project ID (lists all if omitted)")
    .option("--json", "Output as JSON")
    .action(async (id?: string, opts?: { json?: boolean }) => {
      if (id) {
        await showProject(id, opts?.json ?? false);
      } else {
        await listAllProjects(opts?.json ?? false);
      }
    });

  return cmd;
}

async function showProject(id: string, json: boolean): Promise<void> {
  const state = await loadProject(id);
  if (!state) {
    logger.error(`Project not found: ${id}`);
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  printProjectSummary(state);
}

async function listAllProjects(json: boolean): Promise<void> {
  const projects = await listProjects();

  if (projects.length === 0) {
    logger.info("No projects found.");
    return;
  }

  if (json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  logger.header("Projects");
  for (const p of projects) {
    const date = new Date(p.updatedAt).toLocaleString();
    const phaseColor = getPhaseColor(p.phase);
    console.log(`  ${p.id}  ${phaseColor}  ${p.goal}`);
    console.log(`    Updated: ${date}`);
    console.log();
  }
}

function printProjectSummary(state: ProjectState): void {
  logger.header(`Project: ${state.id}`);
  console.log(`  Goal:    ${state.goal}`);
  console.log(`  Repo:    ${state.repo.owner}/${state.repo.name}`);
  console.log(`  Phase:   ${getPhaseColor(state.phase)}`);
  console.log(`  Created: ${new Date(state.createdAt).toLocaleString()}`);
  console.log(`  Updated: ${new Date(state.updatedAt).toLocaleString()}`);

  if (state.planning.sessionId) {
    console.log(`  Planner: ${state.planning.sessionId} (${state.planning.status})`);
  }

  if (state.plan) {
    console.log(`\n  Plan: ${state.plan.summary}`);
    console.log(`  Tasks: ${state.plan.tasks.length}`);

    const tasks = Object.values(state.tasks);
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    const running = tasks.filter((t) => t.status === "running").length;
    const pending = tasks.filter((t) => t.status === "pending").length;

    console.log(
      `  Progress: ${completed} completed, ${running} running, ${pending} pending, ${failed} failed`
    );

    console.log();
    for (const task of state.plan.tasks) {
      const exec = state.tasks[task.id];
      const status = exec?.status ?? "pending";
      const statusIcon = getStatusIcon(status);
      console.log(`    ${statusIcon} ${task.id}: ${task.title}`);
      if (exec?.sessionId) {
        console.log(`      Session: ${exec.sessionId}`);
      }
      if (exec?.branchName) {
        console.log(`      Branch:  ${exec.branchName}`);
      }
      if (exec?.error) {
        console.log(`      Error:   ${exec.error}`);
      }
    }
  }

  if (state.integration.prUrl) {
    console.log(`\n  PR: ${state.integration.prUrl}`);
  }
  if (state.integration.mergedBranch) {
    console.log(`  Branch: ${state.integration.mergedBranch}`);
  }
}

function getPhaseColor(phase: string): string {
  const labels: Record<string, string> = {
    planning: "planning",
    approval: "awaiting approval",
    executing: "executing",
    integrating: "integrating",
    completed: "completed",
    failed: "FAILED",
  };
  return labels[phase] || phase;
}

function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    pending: "○",
    running: "◉",
    completed: "●",
    failed: "✗",
    skipped: "◌",
  };
  return icons[status] || "?";
}
