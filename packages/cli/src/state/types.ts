/**
 * Type definitions for CLI orchestrator state.
 */

export interface CliConfig {
  controlPlaneUrl: string;
  internalCallbackSecret: string;
  defaultModel?: string;
  plannerModel?: string;
  maxParallelSessions?: number;
  gitUserName?: string;
  gitUserEmail?: string;
}

export interface ProjectState {
  id: string;
  createdAt: number;
  updatedAt: number;
  goal: string;
  repo: { owner: string; name: string };
  phase: ProjectPhase;
  planning: PlanningState;
  plan: Plan | null;
  tasks: Record<string, TaskExecution>;
  integration: IntegrationState;
}

export type ProjectPhase =
  | "planning"
  | "approval"
  | "executing"
  | "integrating"
  | "completed"
  | "failed";

export interface PlanningState {
  sessionId: string | null;
  model: string;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
}

export interface Plan {
  summary: string;
  tasks: TaskNode[];
}

export interface TaskNode {
  id: string;
  title: string;
  description: string;
  fileScope: string[];
  dependsOn: string[];
  complexity: "small" | "medium" | "large";
}

export interface TaskExecution {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  sessionId: string | null;
  branchName: string | null;
  startedAt: number | null;
  completedAt: number | null;
  summary: string | null;
  error: string | null;
  retryCount: number;
}

export interface IntegrationState {
  sessionId: string | null;
  status: "pending" | "running" | "completed" | "failed";
  mergedBranch: string | null;
  prUrl: string | null;
  error?: string;
}
