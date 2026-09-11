import * as fs from "node:fs"
import { parseConfig, type MorgConfig } from "../config.js"
import { CliError } from "./error.js"

// morg.toml: precedence is CLI > config > defaults
export function loadConfig(configPath: string | undefined): MorgConfig {
  const resolvedConfigPath =
    configPath ?? (fs.existsSync("morg.toml") ? "morg.toml" : undefined)
  if (!resolvedConfigPath) {
    return {}
  }
  try {
    return parseConfig(fs.readFileSync(resolvedConfigPath, "utf8"))
  } catch (error) {
    throw new CliError(`Error reading ${resolvedConfigPath}:`, {
      cause: error
    })
  }
}
