import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { CliConfig } from "./types.js";

export function getConfigPath(): string {
  return path.join(os.homedir(), ".open-inspect", "config.json");
}

export async function loadConfig(): Promise<CliConfig | null> {
  try {
    const data = await fs.readFile(getConfigPath(), "utf-8");
    return JSON.parse(data) as CliConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}
