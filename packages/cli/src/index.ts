/**
 * Open-Inspect CLI — multi-agent orchestrator.
 *
 * Usage:
 *   oi orchestrate --repo owner/name "Refactor auth to use JWT"
 *   oi config set controlPlaneUrl https://...
 *   oi status [project-id]
 */

import { Command } from "commander";
import { orchestrateCommand } from "./commands/orchestrate.js";
import { configCommand } from "./commands/config.js";
import { statusCommand } from "./commands/status.js";

const program = new Command()
  .name("oi")
  .description("Open-Inspect CLI — multi-agent orchestrator")
  .version("0.1.0");

program.addCommand(orchestrateCommand());
program.addCommand(configCommand());
program.addCommand(statusCommand());

program.parse();
