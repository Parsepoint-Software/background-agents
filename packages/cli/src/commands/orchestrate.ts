/**
 * `oi orchestrate` command — the main multi-agent orchestration flow.
 *
 * Wires together all four phases: plan → approve → execute → integrate.
 */

import { Command } from "commander";
import { loadConfig } from "../state/config.js";
import { createProject, loadProject, saveProject } from "../state/project.js";
import { ControlPlaneClient } from "../api/client.js";
import { runPlanning } from "../orchestrator/planner.js";
import { approvePlan } from "../orchestrator/approver.js";
import { runExecution } from "../orchestrator/executor.js";
import { runIntegration } from "../orchestrator/integrator.js";
import * as logger from "../ui/logger.js";

export function orchestrateCommand(): Command {
  return new Command("orchestrate")
    .description("Plan, execute, and integrate a multi-agent task")
    .argument("<goal>", "High-level goal to accomplish")
    .requiredOption("--repo <owner/name>", "Target repository (owner/name)")
    .option("--model <model>", "Model for worker tasks")
    .option("--planner-model <model>", "Model for planning (default: from config or opus)")
    .option("--max-parallel <n>", "Max parallel sessions", parseInt)
    .option("--resume <id>", "Resume a previous orchestration")
    .option("--dry-run", "Plan only, do not execute")
    .option("--json", "Output structured JSON")
    .action(async (goal: string, opts) => {
      try {
        await run(goal, opts);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

interface OrchestrateOptions {
  repo: string;
  model?: string;
  plannerModel?: string;
  maxParallel?: number;
  resume?: string;
  dryRun?: boolean;
  json?: boolean;
}

async function run(goal: string, opts: OrchestrateOptions): Promise<void> {
  // Load and validate config
  const config = await loadConfig();
  if (!config?.controlPlaneUrl || !config?.internalCallbackSecret) {
    logger.error("CLI not configured. Run: oi config set controlPlaneUrl <url>");
    logger.error("                    then: oi config set internalCallbackSecret <secret>");
    process.exit(1);
  }

  const client = new ControlPlaneClient({
    controlPlaneUrl: config.controlPlaneUrl,
    secret: config.internalCallbackSecret,
  });

  // Parse repo
  const [repoOwner, repoName] = opts.repo.split("/");
  if (!repoOwner || !repoName) {
    logger.error("Invalid repo format. Use: owner/name");
    process.exit(1);
  }

  const plannerModel = opts.plannerModel || config.plannerModel || "openai/gpt-5.2-codex";
  const workerModel = opts.model || config.defaultModel;
  const maxParallel = opts.maxParallel || config.maxParallelSessions;
  const gitUserName = config.gitUserName;
  const gitUserEmail = config.gitUserEmail;

  // Resume or create project
  let state;
  if (opts.resume) {
    state = await loadProject(opts.resume);
    if (!state) {
      logger.error(`Project not found: ${opts.resume}`);
      process.exit(1);
    }
    logger.info(`Resuming project: ${state.id} (phase: ${state.phase})`);
  } else {
    state = createProject({
      goal,
      repo: { owner: repoOwner, name: repoName },
      plannerModel,
    });
    logger.header("Open-Inspect Orchestrator");
    logger.info(`Project: ${state.id}`);
    logger.info(`Goal: ${goal}`);
    logger.info(`Repo: ${repoOwner}/${repoName}`);
    console.log();
  }

  // Phase 1: Planning (skip if already done)
  if (state.phase === "planning" || !state.plan) {
    logger.header("Phase 1: Planning");
    await runPlanning(client, state, { gitUserName, gitUserEmail });
    logger.success("Plan generated.");
    console.log();
  }

  // Phase 2: Approval (skip if already approved)
  if (state.phase === "approval") {
    logger.header("Phase 2: Approval");
    const result = await approvePlan(state.plan!);

    if (result.action === "rejected") {
      state.phase = "failed";
      await saveProject(state);
      logger.error("Plan rejected.");
      process.exit(0);
    }

    // Update plan in case it was edited
    state.plan = result.plan;
    state.phase = "executing";
    await saveProject(state);
    logger.success("Plan approved.");
    console.log();
  }

  // Dry run stops here
  if (opts.dryRun) {
    logger.info("Dry run — stopping before execution.");
    if (opts.json) {
      console.log(JSON.stringify(state, null, 2));
    }
    return;
  }

  // Phase 3: Execution (skip if all tasks completed)
  if (state.phase === "executing") {
    logger.header("Phase 3: Execution");
    await runExecution(client, state, {
      maxParallel,
      model: workerModel,
      gitUserName,
      gitUserEmail,
    });
    console.log();
  }

  // Phase 4: Integration
  if (state.phase === "integrating" || state.phase === "executing") {
    // If still "executing" here, execution just completed successfully
    logger.header("Phase 4: Integration");
    const result = await runIntegration(client, state, {
      model: workerModel,
      gitUserName,
      gitUserEmail,
    });

    if (result.prUrl) {
      logger.success(`PR created: ${result.prUrl}`);
    } else if (result.branchName) {
      logger.success(`Changes on branch: ${result.branchName}`);
    }
    console.log();
  }

  // Final summary
  if (state.phase === "completed") {
    logger.success("Orchestration complete!");
  } else {
    logger.warn(`Orchestration ended in phase: ${state.phase}`);
  }

  if (opts.json) {
    console.log(JSON.stringify(state, null, 2));
  }

  // Exit codes
  const failed = Object.values(state.tasks).filter((t) => t.status === "failed").length;
  if (state.phase === "failed") {
    process.exit(3); // plan-failed
  } else if (failed > 0) {
    process.exit(1); // partial
  }
}
