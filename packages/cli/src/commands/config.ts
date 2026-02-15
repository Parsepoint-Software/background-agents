/**
 * `oi config` command — get/set CLI configuration.
 */

import { Command } from "commander";
import { loadConfig, saveConfig, getConfigPath } from "../state/config.js";
import type { CliConfig } from "../state/types.js";
import * as logger from "../ui/logger.js";

const VALID_KEYS: Array<keyof CliConfig> = [
  "controlPlaneUrl",
  "internalCallbackSecret",
  "defaultModel",
  "plannerModel",
  "maxParallelSessions",
  "gitUserName",
  "gitUserEmail",
];

export function configCommand(): Command {
  const cmd = new Command("config").description("Manage CLI configuration");

  cmd
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action(async (key: string, value: string) => {
      if (!VALID_KEYS.includes(key as keyof CliConfig)) {
        logger.error(`Unknown config key: ${key}`);
        logger.info(`Valid keys: ${VALID_KEYS.join(", ")}`);
        process.exit(1);
      }

      const config = (await loadConfig()) || ({} as Partial<CliConfig>);

      if (key === "maxParallelSessions") {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) {
          logger.error("maxParallelSessions must be a positive integer");
          process.exit(1);
        }
        (config as unknown as Record<string, unknown>)[key] = num;
      } else {
        (config as unknown as Record<string, unknown>)[key] = value;
      }

      await saveConfig(config as CliConfig);
      logger.success(`Set ${key} = ${key === "internalCallbackSecret" ? "***" : value}`);
    });

  cmd
    .command("get [key]")
    .description("Get a configuration value (or all values)")
    .action(async (key?: string) => {
      const config = await loadConfig();
      if (!config) {
        logger.warn(`No config found at ${getConfigPath()}`);
        return;
      }

      if (key) {
        if (!VALID_KEYS.includes(key as keyof CliConfig)) {
          logger.error(`Unknown config key: ${key}`);
          process.exit(1);
        }
        const value = (config as unknown as Record<string, unknown>)[key];
        if (value === undefined) {
          logger.dim("(not set)");
        } else if (key === "internalCallbackSecret") {
          console.log("***");
        } else {
          console.log(String(value));
        }
      } else {
        // Show all config
        for (const k of VALID_KEYS) {
          const v = (config as unknown as Record<string, unknown>)[k];
          const display = k === "internalCallbackSecret" && v ? "***" : (v ?? "(not set)");
          console.log(`  ${k}: ${display}`);
        }
      }
    });

  cmd
    .command("path")
    .description("Show config file path")
    .action(() => {
      console.log(getConfigPath());
    });

  return cmd;
}
