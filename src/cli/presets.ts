import type { MorgConfig } from "../config.js"
import { resolvePresetOptions } from "../conversionOptions.js"
import type { PresetOptions } from "../presets/sides.js"
import type { CliArgs } from "./args.js"
import { CliError } from "./error.js"

/**
 * Resolves the presets per side, flags over the config (ADR 0006).
 * @param cli The parsed arguments.
 * @param config The parsed `morg.toml`.
 * @param from The input's format.
 * @param to The output's format.
 * @returns The conversion's preset options.
 * @throws {CliError} If the names conflict, are unknown or lack a dialect.
 */
export function resolvePresets(
  cli: CliArgs,
  config: MorgConfig,
  from: "markdown" | "org",
  to: "markdown" | "org"
): PresetOptions {
  const flags = {
    ...(cli.presetName && { preset: cli.presetName }),
    ...(cli.inputPresetName && { inputPreset: cli.inputPresetName }),
    ...(cli.outputPresetName && { outputPreset: cli.outputPresetName })
  }
  try {
    return resolvePresetOptions([flags, config], from, to)
  } catch (error) {
    throw new CliError(`Error: ${(error as Error).message}`)
  }
}
