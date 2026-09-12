import { createPreset } from "../presets/registry.js"
import type { Preset } from "../presets/types.js"
import { CliError } from "./error.js"

export function resolvePreset(
  presetName: string | undefined
): Preset | undefined {
  try {
    return createPreset(presetName)
  } catch (error) {
    throw new CliError(`Error: ${(error as Error).message}`)
  }
}
