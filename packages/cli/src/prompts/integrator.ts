export function buildIntegratorPrompt(
  goal: string,
  completedTasks: Array<{
    taskId: string;
    title: string;
    summary: string;
    branchName: string;
  }>,
  repo: { owner: string; name: string }
): string {
  const branchList = completedTasks
    .map(
      (t) => `- **${t.taskId}**: ${t.title}\n  Branch: \`${t.branchName}\`\n  Summary: ${t.summary}`
    )
    .join("\n");

  return `You are a software engineer responsible for integrating multiple completed tasks into a single branch and creating a pull request.

## Repository
Owner: ${repo.owner}
Name: ${repo.name}

## Original Goal
${goal}

## Completed Tasks
${branchList}

## Instructions

1. **Create an integration branch** from the default branch (e.g., \`integrate/<short-description>\`).

2. **Merge each task branch one at a time**, in the order listed above:
   - \`git merge origin/<branchName>\` for each branch
   - If there are merge conflicts, resolve them carefully. Preserve the intent of both sides.
   - After each merge, ensure the code compiles / passes basic checks before moving on.

3. **Run tests** after all branches are merged. Fix any issues that arise from the integration.

4. **Create a pull request** with:
   - A title summarizing the overall change
   - A body that lists all integrated tasks with their summaries
   - Target the default branch

5. Share the PR URL when done.`;
}
