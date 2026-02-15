/**
 * Phase 3: Execution
 *
 * DAG-walking execution loop with work-stealing pattern.
 * Spawns sessions in parallel up to maxParallel, polls for completion,
 * and persists state after every mutation.
 */

import type { ControlPlaneClient } from "../api/client.js";
import type { ProjectState, TaskExecution, TaskNode } from "../state/types.js";
import { saveProject } from "../state/project.js";
import { buildWorkerPrompt, expectedBranchName } from "../prompts/worker.js";
import { ExecutionProgress } from "../ui/progress.js";
import * as logger from "../ui/logger.js";

const POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_PARALLEL = 3;

export interface ExecutionOptions {
  maxParallel?: number;
  model?: string;
  gitUserName?: string;
  gitUserEmail?: string;
}

/**
 * Execute all tasks in the plan according to the DAG.
 *
 * Algorithm (work-stealing):
 *   while pending or running tasks exist:
 *     ready = tasks where status=pending AND all deps completed
 *     slots = maxParallel - running.count
 *     spawn min(ready.count, slots) sessions
 *     sleep, poll running tasks
 *     mark completed or failed
 *     persist state
 */
export async function runExecution(
  client: ControlPlaneClient,
  state: ProjectState,
  options: ExecutionOptions = {}
): Promise<void> {
  const plan = state.plan!;
  const maxParallel = options.maxParallel ?? DEFAULT_MAX_PARALLEL;
  const model = options.model;
  const gitUserName = options.gitUserName;
  const gitUserEmail = options.gitUserEmail;

  state.phase = "executing";
  await saveProject(state);

  // Initialize task executions for any tasks not yet tracked
  for (const task of plan.tasks) {
    if (!state.tasks[task.id]) {
      state.tasks[task.id] = {
        taskId: task.id,
        status: "pending",
        sessionId: null,
        branchName: null,
        startedAt: null,
        completedAt: null,
        summary: null,
        error: null,
        retryCount: 0,
      };
    }
  }
  await saveProject(state);

  const progress = new ExecutionProgress(plan.tasks);
  progress.update(state.tasks);

  const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));

  for (;;) {
    const pending = Object.values(state.tasks).filter((t) => t.status === "pending");
    const running = Object.values(state.tasks).filter((t) => t.status === "running");
    const _failed = Object.values(state.tasks).filter((t) => t.status === "failed");

    // Find ready tasks (pending with all deps completed)
    const ready = pending.filter((t) => {
      const task = taskMap.get(t.taskId)!;
      return task.dependsOn.every((depId) => {
        const dep = state.tasks[depId];
        return dep && (dep.status === "completed" || dep.status === "skipped");
      });
    });

    // Spawn new sessions up to available slots
    const slots = maxParallel - running.length;
    const toSpawn = ready.slice(0, slots);

    for (const exec of toSpawn) {
      const task = taskMap.get(exec.taskId)!;
      await spawnTask(client, state, task, { model, gitUserName, gitUserEmail });
      progress.update(state.tasks);
    }

    // If nothing is running and nothing is ready, we're done
    if (running.length === 0 && toSpawn.length === 0) {
      if (pending.length > 0) {
        // Remaining pending tasks are blocked by failed deps — skip them
        for (const p of pending) {
          p.status = "skipped";
          p.error = "Skipped: dependency failed";
        }
        await saveProject(state);
        progress.update(state.tasks);
      }
      break;
    }

    // Wait and poll running tasks
    await sleep(POLL_INTERVAL_MS);

    for (const exec of Object.values(state.tasks).filter((t) => t.status === "running")) {
      await pollTask(client, state, exec);
    }

    progress.update(state.tasks);
    await saveProject(state);
  }

  progress.finish();

  // Report results
  const completed = Object.values(state.tasks).filter((t) => t.status === "completed");
  const finalFailed = Object.values(state.tasks).filter((t) => t.status === "failed");
  const skipped = Object.values(state.tasks).filter((t) => t.status === "skipped");

  logger.success(`Completed: ${completed.length}/${plan.tasks.length} tasks`);
  if (finalFailed.length > 0) {
    logger.warn(`Failed: ${finalFailed.length} tasks`);
  }
  if (skipped.length > 0) {
    logger.dim(`Skipped: ${skipped.length} tasks (dependency failures)`);
  }

  if (finalFailed.length > 0 && completed.length === 0) {
    state.phase = "failed";
    await saveProject(state);
    throw new Error("All tasks failed");
  }
}

/**
 * Spawn a session for a single task.
 */
async function spawnTask(
  client: ControlPlaneClient,
  state: ProjectState,
  task: TaskNode,
  opts: { model?: string; gitUserName?: string; gitUserEmail?: string }
): Promise<void> {
  const exec = state.tasks[task.id];
  exec.status = "running";
  exec.startedAt = Date.now();

  try {
    const { sessionId } = await client.createSession({
      repoOwner: state.repo.owner,
      repoName: state.repo.name,
      title: `[orchestrator] ${task.id}: ${task.title}`,
      model: opts.model,
      githubName: opts.gitUserName,
      githubEmail: opts.gitUserEmail,
    });

    exec.sessionId = sessionId;
    exec.branchName = expectedBranchName(task);
    await saveProject(state);

    // Build context from completed dependencies
    const completedDeps = task.dependsOn
      .map((depId) => state.tasks[depId])
      .filter((d) => d && d.status === "completed")
      .map((d) => ({
        taskId: d.taskId,
        summary: d.summary || "",
        branchName: d.branchName || "",
      }));

    const prompt = buildWorkerPrompt(task, completedDeps);
    await client.sendPrompt(sessionId, prompt, { source: "cli" });

    logger.info(`Started ${task.id}: ${task.title} (session: ${sessionId})`);
  } catch (error) {
    exec.status = "failed";
    exec.error = error instanceof Error ? error.message : String(error);
    exec.completedAt = Date.now();
    await saveProject(state);
    logger.error(`Failed to start ${task.id}: ${exec.error}`);
  }
}

/**
 * Poll a running task for completion.
 *
 * Completion is detected via:
 * 1. An execution_complete event in the events list, OR
 * 2. Sandbox status === "stopped" (fallback)
 *
 * The sandbox status "ready" means idle between prompts — NOT finished.
 */
async function pollTask(
  client: ControlPlaneClient,
  state: ProjectState,
  exec: TaskExecution
): Promise<void> {
  if (!exec.sessionId) return;

  try {
    const session = await client.getSession(exec.sessionId);

    // Still starting up — not ready to check for completion
    const startingUp =
      session.sandboxStatus === "pending" ||
      session.sandboxStatus === "warming" ||
      session.sandboxStatus === "syncing";
    if (startingUp) {
      return;
    }

    // Fetch events to check for execution_complete (no cursor — deduplicate isn't
    // needed here since we only collect results on completion, not incrementally)
    const { events } = await client.getEvents(exec.sessionId, { limit: 200 });

    let executionComplete = false;
    let hasError = false;
    let errorMsg: string | null = null;
    const tokens: string[] = [];

    for (const event of events) {
      const data = event.data as Record<string, unknown>;
      const eventType = event.type as string;

      if (eventType === "token" && typeof data.content === "string") {
        tokens.push(data.content);
      }
      if (eventType === "execution_complete") {
        executionComplete = true;
        if (data.success === false) {
          hasError = true;
          if (data.error) errorMsg = String(data.error);
        }
      }
      if (eventType === "error") {
        hasError = true;
        if (data.error) errorMsg = String(data.error);
      }
    }

    // Not done yet — wait for execution_complete or sandbox stopped
    if (!executionComplete && session.sandboxStatus !== "stopped") {
      return;
    }

    // Session finished — collect results
    // Prefer branch from control plane, fall back to expected branch set during spawn
    if (session.branchName) {
      exec.branchName = session.branchName;
    }

    const tokenText = tokens.join("");
    exec.summary = tokenText.length > 500 ? tokenText.slice(-500) : tokenText;

    if (hasError) {
      exec.status = "failed";
      exec.error = errorMsg || "Session completed with errors";
    } else {
      exec.status = "completed";
    }

    exec.completedAt = Date.now();
    await saveProject(state);
  } catch (error) {
    // Polling failure is not fatal — retry next cycle (fail-open)
    logger.debug(
      `Poll error for ${exec.taskId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
