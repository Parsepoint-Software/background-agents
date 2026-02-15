/**
 * Phase 1: Planning
 *
 * Creates a planner session, sends the planning prompt, polls for completion,
 * and extracts the structured plan from the agent's output.
 */

import type { ControlPlaneClient } from "../api/client.js";
import type { Plan, ProjectState } from "../state/types.js";
import { saveProject } from "../state/project.js";
import { buildPlannerPrompt } from "../prompts/planner.js";
import { extractJson } from "../util/json-extractor.js";
import { validateDag } from "./dag.js";
import * as logger from "../ui/logger.js";

const POLL_INTERVAL_MS = 5000;

/**
 * Run the planning phase: create a session, send the planner prompt,
 * poll until complete, extract and validate the plan.
 */
export async function runPlanning(
  client: ControlPlaneClient,
  state: ProjectState,
  options: { gitUserName?: string; gitUserEmail?: string } = {}
): Promise<Plan> {
  state.phase = "planning";
  state.planning.status = "running";
  await saveProject(state);

  // Create planner session
  logger.step(1, 4, "Creating planner session...");
  const { sessionId } = await client.createSession({
    repoOwner: state.repo.owner,
    repoName: state.repo.name,
    title: `[orchestrator] Plan: ${state.goal}`,
    model: state.planning.model,
    githubName: options.gitUserName,
    githubEmail: options.gitUserEmail,
  });

  state.planning.sessionId = sessionId;
  await saveProject(state);
  logger.info(`Planner session: ${sessionId}`);

  // Send planner prompt
  const prompt = buildPlannerPrompt(state.goal, state.repo);
  await client.sendPrompt(sessionId, prompt, { source: "cli" });
  logger.info("Planner prompt sent, waiting for plan...");

  // Poll until execution completes
  const text = await pollForCompletion(client, sessionId);

  // Extract JSON plan from agent output
  logger.debug(`Planner output (${text.length} chars): ${text.slice(0, 500)}`);
  const plan = extractJson<Plan>(text);
  if (!plan || !plan.tasks || !Array.isArray(plan.tasks)) {
    state.planning.status = "failed";
    state.planning.error = "Failed to extract valid plan from agent output";
    state.phase = "failed";
    await saveProject(state);
    if (text.length === 0) {
      throw new Error("Planner produced no output — session may have failed to start or timed out");
    }
    throw new Error(
      `Failed to extract valid plan from agent output (${text.length} chars). ` +
        `First 200 chars: ${text.slice(0, 200)}`
    );
  }

  // Validate the DAG
  const validation = validateDag(plan.tasks);
  if (!validation.valid) {
    state.planning.status = "failed";
    state.planning.error = `Invalid plan: ${validation.errors.join("; ")}`;
    state.phase = "failed";
    await saveProject(state);
    throw new Error(`Invalid plan: ${validation.errors.join("; ")}`);
  }

  state.planning.status = "completed";
  state.plan = plan;
  state.phase = "approval";
  await saveProject(state);

  return plan;
}

/**
 * Poll a session until the agent finishes execution.
 * Collects all token events to reconstruct the agent's text output.
 *
 * Events are fetched without a cursor each cycle (the API's cursor means
 * "older than", not "newer than"). We deduplicate by event ID.
 */
async function pollForCompletion(client: ControlPlaneClient, sessionId: string): Promise<string> {
  const seenEventIds = new Set<string>();
  const tokenChunks: string[] = [];
  let hasStarted = false;

  for (;;) {
    await sleep(POLL_INTERVAL_MS);

    const session = await client.getSession(sessionId);
    logger.debug(
      `Poll: status=${session.status} sandbox=${session.sandboxStatus} processing=${session.isProcessing}`
    );

    if (session.isProcessing) {
      hasStarted = true;
    }

    // Fetch recent events (no cursor — always get the latest batch, deduplicate by ID)
    const { events } = await client.getEvents(sessionId, { limit: 200 });
    let executionComplete = false;
    let executionError: string | null = null;

    for (const event of events) {
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);

      const data = event.data as Record<string, unknown>;
      const eventType = event.type as string;

      if (eventType === "token" && typeof data.content === "string") {
        tokenChunks.push(data.content);
        hasStarted = true;
      }
      if (eventType === "ready") {
        hasStarted = true;
      }
      if (eventType === "execution_complete") {
        executionComplete = true;
        if (data.success === false && data.error) {
          executionError = String(data.error);
        }
      }
      if (eventType === "error" && data.error) {
        executionError = String(data.error);
      }
    }

    // If we got an execution_complete event, we're done
    if (executionComplete) {
      if (executionError) {
        throw new Error(`Agent execution failed: ${executionError}`);
      }
      break;
    }

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
