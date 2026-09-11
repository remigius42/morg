import { logseq } from "../presets/logseq.js"
import { obsidian } from "../presets/obsidian.js"
import type { Preset } from "../presets/types.js"
import { CliError } from "./error.js"

const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

export function resolvePreset(
  presetName: string | undefined
): Preset | undefined {
  if (!presetName) {
    return undefined
  }
  const factory = PRESETS[presetName]
  if (!factory) {
    throw new CliError(
      `Error: Unknown preset '${presetName}'. Available presets: ${Object.keys(PRESETS).join(", ")}`
    )
  }
  return factory()
}
