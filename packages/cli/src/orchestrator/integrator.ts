/**
 * Phase 4: Integration
 *
 * Creates a merge session that combines all completed task branches,
 * resolves conflicts, runs tests, and creates a PR.
 */

import type { ControlPlaneClient } from "../api/client.js";
import type { ProjectState } from "../state/types.js";
import { saveProject } from "../state/project.js";
import { buildIntegratorPrompt } from "../prompts/integrator.js";
import * as logger from "../ui/logger.js";

const POLL_INTERVAL_MS = 5000;

export interface IntegrationResult {
  branchName: string | null;
  prUrl: string | null;
}

/**
 * Run the integration phase: create a merge session, send the integration
 * prompt, poll until complete, and extract PR information.
 */
export async function runIntegration(
  client: ControlPlaneClient,
  state: ProjectState,
  options: { model?: string; gitUserName?: string; gitUserEmail?: string } = {}
): Promise<IntegrationResult> {
  state.phase = "integrating";
  state.integration.status = "running";
  await saveProject(state);

  // Collect completed task info
  const completedTasks = Object.values(state.tasks)
    .filter((t) => t.status === "completed" && t.branchName)
    .map((t) => {
      const taskNode = state.plan!.tasks.find((n) => n.id === t.taskId);
      return {
        taskId: t.taskId,
        title: taskNode?.title || t.taskId,
        summary: t.summary || "",
        branchName: t.branchName!,
      };
    });

  if (completedTasks.length === 0) {
    state.integration.status = "failed";
    state.integration.error = "No completed tasks to integrate";
    state.phase = "failed";
    await saveProject(state);
    throw new Error("No completed tasks to integrate");
  }

  // If only one task, its branch is the result — no merge needed
  if (completedTasks.length === 1) {
    logger.info("Single task completed — no merge needed.");
    state.integration.status = "completed";
    state.integration.mergedBranch = completedTasks[0].branchName;
    state.phase = "completed";
    await saveProject(state);
    return {
      branchName: completedTasks[0].branchName,
      prUrl: null,
    };
  }

  // Create merge session
  logger.step(4, 4, "Creating integration session...");
  const { sessionId } = await client.createSession({
    repoOwner: state.repo.owner,
    repoName: state.repo.name,
    title: `[orchestrator] Integrate: ${state.goal}`,
    model: options.model,
    githubName: options.gitUserName,
    githubEmail: options.gitUserEmail,
  });

  state.integration.sessionId = sessionId;
  await saveProject(state);
  logger.info(`Integration session: ${sessionId}`);

  // Send integration prompt
  const prompt = buildIntegratorPrompt(state.goal, completedTasks, state.repo);
  await client.sendPrompt(sessionId, prompt, { source: "cli" });
  logger.info("Integration prompt sent, waiting for merge...");

  // Poll until complete
  await pollForCompletion(client, sessionId);

  // Get the session to find the branch
  const session = await client.getSession(sessionId);

  // Look for PR URL in artifacts
  const { artifacts } = await client.getArtifacts(sessionId);
  const prArtifact = artifacts.find((a) => a.type === "pr" && a.url);

  const result: IntegrationResult = {
    branchName: session.branchName,
    prUrl: prArtifact?.url || null,
  };

  state.integration.status = "completed";
  state.integration.mergedBranch = result.branchName;
  state.integration.prUrl = result.prUrl;
  state.phase = "completed";
  await saveProject(state);

  return result;
}

/**
 * Poll a session until the agent finishes execution.
 * Uses event ID deduplication instead of cursor (see planner.ts for rationale).
 */
async function pollForCompletion(client: ControlPlaneClient, sessionId: string): Promise<string> {
  const seenEventIds = new Set<string>();
  const tokenChunks: string[] = [];
  let hasStarted = false;

  for (;;) {
    await sleep(POLL_INTERVAL_MS);

    const session = await client.getSession(sessionId);

    if (session.isProcessing) {
      hasStarted = true;
    }

    const { events } = await client.getEvents(sessionId, { limit: 200 });
    let executionComplete = false;

    for (const event of events) {
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);

      const data = event.data as Record<string, unknown>;
      if ((event.type as string) === "token" && typeof data.content === "string") {
        tokenChunks.push(data.content);
        hasStarted = true;
      }
      if ((event.type as string) === "ready") {
        hasStarted = true;
      }
      if ((event.type as string) === "execution_complete") {
        executionComplete = true;
      }
    }

    if (executionComplete) break;

    // Fallback: if sandbox stopped, treat as complete
    if (hasStarted && session.sandboxStatus === "stopped") {
      break;
    }
  }

  return tokenChunks.join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
