import chalk from "chalk";
import type { TaskNode, TaskExecution } from "../state/types.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class ExecutionProgress {
  private tasks: TaskNode[];
  private frame = 0;
  private lineCount = 0;

  constructor(tasks: TaskNode[]) {
    this.tasks = tasks;
  }

  update(executions: Record<string, TaskExecution>): void {
    // Clear previous output
    if (this.lineCount > 0) {
      process.stdout.write(`\x1b[${this.lineCount}A\x1b[0J`);
    }

    const lines: string[] = [];

    for (const task of this.tasks) {
      const exec = executions[task.id];
      const status = exec?.status ?? "pending";
      lines.push(`  ${this.formatStatus(status)} ${this.formatTitle(task.id, task.title, status)}`);
    }

    const summary = this.buildSummary(executions);
    lines.push("");
    lines.push(summary);

    const output = lines.join("\n");
    process.stdout.write(output + "\n");
    this.lineCount = lines.length;
    this.frame++;
  }

  finish(): void {
    // No clearing on final render - just reset line count so we don't try to clear next call
    this.lineCount = 0;
  }

  private formatStatus(status: TaskExecution["status"]): string {
    switch (status) {
      case "pending":
        return chalk.gray("○");
      case "running":
        return chalk.yellow(SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length]);
      case "completed":
        return chalk.green("✓");
      case "failed":
        return chalk.red("✗");
      case "skipped":
        return chalk.dim("⊘");
    }
  }

  private formatTitle(id: string, title: string, status: TaskExecution["status"]): string {
    const label = `${id}: ${title}`;
    switch (status) {
      case "pending":
        return chalk.gray(label);
      case "running":
        return chalk.yellow(label);
      case "completed":
        return chalk.green(label);
      case "failed":
        return chalk.red(label);
      case "skipped":
        return chalk.dim(label);
    }
  }

  private buildSummary(executions: Record<string, TaskExecution>): string {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const task of this.tasks) {
      const status = executions[task.id]?.status ?? "pending";
      if (status === "pending") pending++;
      else if (status === "running") running++;
      else if (status === "completed") completed++;
      else if (status === "failed") failed++;
    }

    const parts: string[] = [];
    if (completed > 0) parts.push(chalk.green(`${completed} done`));
    if (running > 0) parts.push(chalk.yellow(`${running} running`));
    if (pending > 0) parts.push(chalk.gray(`${pending} pending`));
    if (failed > 0) parts.push(chalk.red(`${failed} failed`));

    return `  ${parts.join(chalk.dim(" | "))}`;
  }
}
