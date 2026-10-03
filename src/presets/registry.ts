import { logseq } from "./logseq.js"
import { obsidian } from "./obsidian.js"
import type { Preset } from "./types.js"

// the one place a dialect preset is registered; both adapters (CLI and
// Web UI) resolve names through here so they cannot drift apart
const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

// the Vanilla side: no preset, but a name to set a side back to it
const VANILLA = "vanilla"

const PRESET_NAMES = [VANILLA, ...Object.keys(PRESETS)]

/**
 * Instantiates a preset by name.
 * @param presetName Preset name, or `undefined` for no preset.
 * @returns The preset, or `undefined` for none or `vanilla`.
 * @throws If the name is not a known preset.
 */
export function createPreset(
  presetName: string | undefined
): Preset | undefined {
  if (!presetName || presetName === VANILLA) {
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
