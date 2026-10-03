import type { MorgConfig } from "./config.js"
import type {
  MarkdownStyleOptions,
  MarkdownToOrgOptions,
  OrgToMarkdownOptions,
  Toggle
} from "./options.js"
import type { Preset } from "./presets/types.js"
import {
  resolveSide,
  type Format,
  type PresetOptions
} from "./presets/sides.js"
import { createPreset } from "./presets/registry.js"

/** Explicitly requested option values; `undefined` leaves it to config. */
export interface ConversionOverrides {
  taskCheckboxes?: boolean
  interpretHtml?: boolean
  recordStyle?: boolean
  useHtml?: Toggle
  markdownStyle?: MarkdownStyleOptions
}

/** Values that apply to both directions. */
export interface SharedConversionOptions extends PresetOptions {
  onWarning?: (message: string) => void
  orgismKeys?: Record<string, string>
}

/**
 * Layers explicit overrides over the config file, per direction. Used by
 * both adapters (CLI and Web UI) so the documented precedence (CLI or
 * form > config > defaults) means the same thing in each.
 * @param overrides Explicitly requested values; `undefined` defers to config.
 * @param config The parsed `morg.toml`.
 * @param shared Values that apply to both directions.
 * @returns The options object for each direction.
 */
export function buildConversionOptions(
  overrides: ConversionOverrides,
  config: MorgConfig,
  shared: SharedConversionOptions
): {
  mdToOrgOptions: MarkdownToOrgOptions
  // always set, even when empty: config style plus the overrides
  orgToMdOptions: OrgToMarkdownOptions & { markdownStyle: MarkdownStyleOptions }
} {
  const mdToOrgOptions: MarkdownToOrgOptions = {
    ...config.markdownToOrg,
    ...shared,
    ...(overrides.interpretHtml !== undefined && {
      interpretHtml: overrides.interpretHtml
    }),
    ...(overrides.recordStyle !== undefined && {
      recordStyle: overrides.recordStyle
    })
  }
  const orgToMdOptions: OrgToMarkdownOptions & {
    markdownStyle: MarkdownStyleOptions
  } = {
    ...config.orgToMarkdown,
    ...shared,
    ...(overrides.useHtml !== undefined && { useHtml: overrides.useHtml }),
    ...(overrides.taskCheckboxes !== undefined && {
      taskCheckboxes: overrides.taskCheckboxes
    }),
    markdownStyle: {
      ...config.orgToMarkdown?.markdownStyle,
      ...overrides.markdownStyle
    }
  }
  return { mdToOrgOptions, orgToMdOptions }
}

/** Preset names as one layer (CLI, form or config) sets them. */
export interface PresetNames {
  preset?: string
  inputPreset?: string
  outputPreset?: string
}

// a side's preset name, and whether it came by `preset` for both
interface SideName {
  name: string
  shorthand: boolean
}

function sideName(
  layers: PresetNames[],
  key: "inputPreset" | "outputPreset"
): SideName | undefined {
  for (const layer of layers) {
    if (layer[key]) {
      return { name: layer[key], shorthand: false }
    }
    if (layer.preset) {
      return { name: layer.preset, shorthand: true }
    }
  }
  return undefined
}

// across layers the higher one wins; within one, two names conflict
function rejectConflict(layer: PresetNames): void {
  for (const key of ["inputPreset", "outputPreset"] as const) {
    const side = layer[key]
    if (layer.preset && side && side !== layer.preset) {
      throw new Error(
        `preset '${layer.preset}' conflicts with ${key} '${side}'`
      )
    }
  }
}

function sidePreset(
  name: SideName | undefined,
  format: Format,
  side: "input" | "output"
): Preset | undefined {
  const preset = createPreset(name?.name)
  return name?.shorthand
    ? resolveSide(undefined, preset, format, side)
    : resolveSide(preset, undefined, format, side)
}

// normalizing goes there and back within one dialect (ADR 0006), so
// both sides must name the same preset, which then sets both ways
function normalizePresetOptions(layers: PresetNames[]): PresetOptions {
  const input = sideName(layers, "inputPreset")?.name ?? "vanilla"
  const output = sideName(layers, "outputPreset")?.name ?? "vanilla"
  if (input !== output) {
    throw new Error(
      `normalize takes one preset; got inputPreset '${input}' and outputPreset '${output}'`
    )
  }
  const preset = createPreset(input)
  return preset ? { preset } : {}
}

/**
 * Resolves the presets of a conversion over layers of names (ADR 0006):
 * per side, the first layer that sets the side or `preset` wins.
 * @param layers Preset names by layer, highest first.
 * @param from The input's format.
 * @param to The output's format; the input's for normalizing.
 * @returns The conversion's preset options.
 * @throws If a layer sets `preset` and another side preset, or a side
 * preset has no dialect for its side's format, or normalizing names two.
 */
export function resolvePresetOptions(
  layers: PresetNames[],
  from: Format,
  to: Format
): PresetOptions {
  layers.forEach(rejectConflict)
  if (from === to) {
    return normalizePresetOptions(layers)
  }
  const input = sidePreset(sideName(layers, "inputPreset"), from, "input")
  const output = sidePreset(sideName(layers, "outputPreset"), to, "output")
  return {
    ...(input && { inputPreset: input }),
    ...(output && { outputPreset: output })
  }
}
