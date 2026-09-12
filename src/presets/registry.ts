import { logseq } from "./logseq.js"
import { obsidian } from "./obsidian.js"
import type { Preset } from "./types.js"

// the one place a dialect preset is registered; both adapters (CLI and
// Web UI) resolve names through here so they cannot drift apart
const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

const PRESET_NAMES = Object.keys(PRESETS)

/**
 * Instantiates a preset by name.
 * @param presetName Preset name, or `undefined` for no preset.
 * @returns The preset, or `undefined` when no name was given.
 * @throws If the name is not a known preset.
 */
export function createPreset(
  presetName: string | undefined
): Preset | undefined {
  if (!presetName) {
    return undefined
  }
  const factory = PRESETS[presetName]
  if (!factory) {
    throw new Error(
      `Unknown preset '${presetName}'. Available presets: ${PRESET_NAMES.join(", ")}`
    )
  }
  return factory()
}
