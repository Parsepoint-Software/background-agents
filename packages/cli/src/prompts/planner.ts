export function buildPlannerPrompt(goal: string, repo: { owner: string; name: string }): string {
  return `You are a senior software architect planning the implementation of a coding task.

## Repository
Owner: ${repo.owner}
Name: ${repo.name}

## Goal
${goal}

## Instructions

1. **Explore the codebase first.** Read key files to understand the project structure, architecture, and conventions. Look at the README, package.json (or equivalent), and relevant source directories.

2. **Decompose the goal into independent sub-tasks.** Each task should:
   - Have a clear, specific title and description
   - List the files it will create or modify (\`fileScope\`)
   - Minimize dependencies on other tasks to maximize parallelism
   - Be sized appropriately: "small" (< 50 lines changed), "medium" (50-200), "large" (200+)

3. **Minimize dependencies.** Only add a dependency when a task truly cannot start without another task's output (e.g., it needs a type definition or API that the other task creates). Tasks touching independent files should have no dependencies.

4. **Keep file scopes non-overlapping.** Two tasks should not modify the same file. If they must, make one depend on the other.

5. **Output your plan as JSON** in a \`\`\`json code fence matching this schema:

\`\`\`json
{
  "summary": "Brief description of the overall plan",
  "tasks": [
    {
      "id": "t1",
      "title": "Short task title",
      "description": "Detailed description of what to implement",
      "fileScope": ["src/path/to/file.ts", "src/path/to/other.ts"],
      "dependsOn": [],
      "complexity": "small"
    }
  ]
}
\`\`\`

Use short IDs like "t1", "t2", etc. The \`dependsOn\` array contains IDs of tasks that must complete before this one can start.

Think carefully about the decomposition. Fewer, well-scoped tasks are better than many tiny ones.`;
}
