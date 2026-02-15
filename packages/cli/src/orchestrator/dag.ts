import type { TaskNode } from "../state/types.js";

/**
 * Validate a DAG of tasks for structural correctness.
 */
export function validateDag(tasks: TaskNode[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set(tasks.map((t) => t.id));

  // Check for duplicate IDs
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) {
      errors.push(`Duplicate task ID: "${task.id}"`);
    }
    seen.add(task.id);
  }

  // Check for missing dependency references
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(`Task "${task.id}" depends on unknown task "${dep}"`);
      }
    }
  }

  // Check for cycles using Tarjan's algorithm
  const cycleNodes = detectCycles(tasks);
  if (cycleNodes.length > 0) {
    errors.push(`Cycle detected involving tasks: ${cycleNodes.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Group tasks into parallel execution waves.
 * Wave 0 = tasks with no dependencies.
 * Wave N = tasks whose dependencies are all in waves < N.
 */
export function computeWaves(tasks: TaskNode[]): TaskNode[][] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const waveIndex = new Map<string, number>();
  const waves: TaskNode[][] = [];

  function getWave(id: string): number {
    if (waveIndex.has(id)) return waveIndex.get(id)!;

    const task = taskMap.get(id)!;
    if (task.dependsOn.length === 0) {
      waveIndex.set(id, 0);
      return 0;
    }

    const maxDepWave = Math.max(...task.dependsOn.map((dep) => getWave(dep)));
    const wave = maxDepWave + 1;
    waveIndex.set(id, wave);
    return wave;
  }

  for (const task of tasks) {
    getWave(task.id);
  }

  for (const task of tasks) {
    const w = waveIndex.get(task.id)!;
    while (waves.length <= w) waves.push([]);
    waves[w].push(task);
  }

  return waves;
}

/**
 * Return tasks in topological order (dependencies before dependents).
 */
export function topologicalSort(tasks: TaskNode[]): TaskNode[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const result: TaskNode[] = [];

  function visit(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);

    const task = taskMap.get(id)!;
    for (const dep of task.dependsOn) {
      visit(dep);
    }
    result.push(task);
  }

  for (const task of tasks) {
    visit(task.id);
  }

  return result;
}

/**
 * Detect cycles using Tarjan's strongly connected components algorithm.
 * Returns IDs of tasks involved in cycles (empty if acyclic).
 */
function detectCycles(tasks: TaskNode[]): string[] {
  const adj = new Map<string, string[]>();
  for (const task of tasks) {
    adj.set(task.id, task.dependsOn);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycleNodes: string[] = [];

  function strongConnect(id: string): void {
    indices.set(id, index);
    lowlinks.set(id, index);
    index++;
    stack.push(id);
    onStack.add(id);

    for (const dep of adj.get(id) ?? []) {
      if (!indices.has(dep)) {
        strongConnect(dep);
        lowlinks.set(id, Math.min(lowlinks.get(id)!, lowlinks.get(dep)!));
      } else if (onStack.has(dep)) {
        lowlinks.set(id, Math.min(lowlinks.get(id)!, indices.get(dep)!));
      }
    }

    if (lowlinks.get(id) === indices.get(id)) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
      } while (w !== id);

      // A strongly connected component with more than 1 node is a cycle
      if (component.length > 1) {
        cycleNodes.push(...component);
      }
    }
  }

  for (const task of tasks) {
    if (!indices.has(task.id)) {
      strongConnect(task.id);
    }
  }

  return cycleNodes;
}
