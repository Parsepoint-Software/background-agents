import chalk from "chalk";
import type { Plan } from "../state/types.js";
import { computeWaves } from "../orchestrator/dag.js";
import * as logger from "./logger.js";

/**
 * Render a plan for user review and approval.
 */
export function displayPlan(plan: Plan): void {
  logger.header("Execution Plan");
  console.log(plan.summary);
  console.log();

  // Task table
  const tasks = plan.tasks;
  console.log(
    chalk.bold(
      padRight("#", 6) +
        padRight("Deps", 12) +
        padRight("Title", 40) +
        padRight("Scope", 30) +
        "Size"
    )
  );
  console.log(chalk.dim("─".repeat(96)));

  for (const task of tasks) {
    const deps = task.dependsOn.length > 0 ? task.dependsOn.join(", ") : "—";
    const scope =
      task.fileScope.length > 2
        ? `${task.fileScope.slice(0, 2).join(", ")} +${task.fileScope.length - 2}`
        : task.fileScope.join(", ") || "—";
    const sizeColor =
      task.complexity === "large"
        ? chalk.red
        : task.complexity === "medium"
          ? chalk.yellow
          : chalk.green;

    console.log(
      padRight(task.id, 6) +
        padRight(deps, 12) +
        padRight(task.title, 40) +
        padRight(scope, 30) +
        sizeColor(task.complexity)
    );
  }

  // Execution waves
  const waves = computeWaves(tasks);
  console.log();
  logger.header("Execution Waves");

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    const taskIds = wave.map((t) => t.id).join(", ");
    console.log(
      `  ${chalk.cyan(`Wave ${i + 1}`)}  ${taskIds} ${chalk.dim(`(${wave.length} parallel)`)}`
    );
  }

  console.log();
  logger.info(`${tasks.length} tasks across ${waves.length} waves`);
}

function padRight(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width - 1) + " ";
  return str + " ".repeat(width - str.length);
}
