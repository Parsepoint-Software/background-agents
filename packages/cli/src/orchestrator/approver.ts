/**
 * Phase 2: Approval
 *
 * Display the plan to the user and get interactive approval,
 * with options to approve, edit in $EDITOR, or reject.
 */

import { createInterface } from "node:readline";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import type { Plan } from "../state/types.js";
import { displayPlan } from "../ui/plan-display.js";
import { validateDag } from "./dag.js";
import { extractJson } from "../util/json-extractor.js";
import * as logger from "../ui/logger.js";

export type ApprovalResult = { action: "approved"; plan: Plan } | { action: "rejected" };

/**
 * Display the plan and interactively ask for user approval.
 */
export async function approvePlan(plan: Plan): Promise<ApprovalResult> {
  displayPlan(plan);

  for (;;) {
    const answer = await prompt("\nApprove plan? (Y)es / (e)dit in $EDITOR / (r)eject: ");
    const choice = answer.trim().toLowerCase();

    if (choice === "" || choice === "y" || choice === "yes") {
      return { action: "approved", plan };
    }

    if (choice === "e" || choice === "edit") {
      const edited = await editPlan(plan);
      if (edited) {
        logger.success("Plan updated.");
        displayPlan(edited);
        // Re-prompt after showing edited plan
        continue;
      }
      logger.warn("Edit cancelled or invalid — using original plan.");
      continue;
    }

    if (choice === "r" || choice === "reject") {
      return { action: "rejected" };
    }

    logger.warn("Invalid choice. Enter Y, e, or r.");
  }
}

/**
 * Open the plan in $EDITOR, read back the modified JSON, and validate it.
 */
async function editPlan(plan: Plan): Promise<Plan | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  const tmpPath = join(tmpdir(), `oi-plan-${Date.now()}.json`);

  try {
    await writeFile(tmpPath, JSON.stringify(plan, null, 2), "utf-8");
    execSync(`${editor} "${tmpPath}"`, { stdio: "inherit" });

    const content = await readFile(tmpPath, "utf-8");
    const edited = extractJson<Plan>(content);

    if (!edited || !edited.tasks || !Array.isArray(edited.tasks)) {
      logger.error("Edited file does not contain a valid plan.");
      return null;
    }

    const validation = validateDag(edited.tasks);
    if (!validation.valid) {
      logger.error(`Edited plan is invalid: ${validation.errors.join("; ")}`);
      return null;
    }

    return edited;
  } catch {
    return null;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
