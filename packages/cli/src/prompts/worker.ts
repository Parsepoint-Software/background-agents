import type { TaskNode } from "../state/types.js";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function expectedBranchName(task: TaskNode): string {
  return `oi/${task.id}-${slugify(task.title)}`;
}

export function buildWorkerPrompt(
  task: TaskNode,
  completedDeps: Array<{ taskId: string; summary: string; branchName: string }>
): string {
  let depContext = "";
  if (completedDeps.length > 0) {
    const depLines = completedDeps
      .map((d) => `- **${d.taskId}** (branch: \`${d.branchName}\`): ${d.summary}`)
      .join("\n");
    depContext = `
## Completed Dependencies
The following tasks have already been completed. Their changes are on separate branches. Do NOT merge or pull those branches — work from the default branch. Their summaries provide context for what has already been done:

${depLines}
`;
  }

  return `You are a software engineer implementing a specific task within a larger project.

## Task: ${task.title}
ID: ${task.id}
Complexity: ${task.complexity}

## Description
${task.description}

## File Scope
You should only create or modify files within this scope:
${task.fileScope.map((f) => `- \`${f}\``).join("\n")}
${depContext}
## Instructions

1. Implement the task as described. Stay within the file scope listed above.
2. Follow existing code conventions and patterns in the repository.
3. Write clean, working code. Add tests if the project has a test suite and the change warrants it.
4. Do NOT merge any other branches. Work from the current default branch.
5. Create a new feature branch named \`oi/${task.id}-${slugify(task.title)}\`, commit your changes there with a clear commit message, and push the branch to the remote with \`git push -u origin <branch-name>\`. If the push fails due to authentication, use the \`create-pull-request\` tool instead — it handles authentication automatically.
6. When finished, provide a brief summary of the changes you made.`;
}
