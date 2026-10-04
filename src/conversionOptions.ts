import { configuredHtml, type MorgConfig } from "./config.js"
import type {
  HtmlConstruct,
  MarkdownStyleOptions,
  MarkdownToOrgOptions,
  OrgToMarkdownOptions,
  Spelling,
  Spellings,
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
  recordMarkdownStyle?: boolean
  interpretHtml?: Toggle
  spelling?: Spellings
  style?: MarkdownStyleOptions
}

/** Values that apply to both directions. */
export interface SharedConversionOptions extends PresetOptions {
  onWarning?: (message: string) => void
  orgismKeys?: Record<string, string>
}

type PerConstruct<T> = Partial<Record<HtmlConstruct, T>>

// the entries that are set, so an unset one leaves a lower layer's
function setEntries<T extends object>(
  entries: T
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined)
  ) as { [K in keyof T]?: Exclude<T[K], undefined> }
}

// one value for every construct wins outright, a table per construct
function layer<T extends boolean | string>(
  override: T | Record<string, T> | undefined,
  config: PerConstruct<T>
): T | Record<string, T> | undefined {
  if (typeof override === "boolean" || typeof override === "string") {
    return override
  }
  const merged = {
    ...config,
    ...override
  } as Record<string, T>
  return Object.keys(merged).length ? merged : undefined
}

/**
 * Layers explicit overrides over the config file, per direction. Used by
 * both adapters (CLI and Web UI) so the documented precedence (CLI or
 * form > config > defaults) means the same thing in each. A direction
 * takes the sections of the formats it reads and writes (ADR 0007).
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
  orgToMdOptions: OrgToMarkdownOptions & { style: MarkdownStyleOptions }
} {
  const configured = configuredHtml(config.markdown)
  const interpretHtml = layer<boolean>(
    overrides.interpretHtml,
    configured.interpretHtml
  )
  const spelling = layer<Spelling>(overrides.spelling, configured.spelling)
  const orgOutput = config.org?.output
  const markdownOutput = config.markdown?.output
  const mdToOrgOptions: MarkdownToOrgOptions = {
    ...setEntries({
      preserveMdisms: orgOutput?.preserveMdisms,
      recordMarkdownStyle: orgOutput?.recordMarkdownStyle
    }),
    ...shared,
    ...setEntries({
      interpretHtml,
      recordMarkdownStyle: overrides.recordMarkdownStyle
    })
  }
  const orgToMdOptions: OrgToMarkdownOptions & {
    style: MarkdownStyleOptions
  } = {
    ...setEntries({
      preserveOrgisms: markdownOutput?.preserveOrgisms,
      taskCheckboxes: markdownOutput?.taskCheckboxes
    }),
    ...shared,
    ...setEntries({ spelling, taskCheckboxes: overrides.taskCheckboxes }),
    style: { ...markdownOutput?.style, ...overrides.style }
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

// one preset on both sides of one format normalizes, going there and
// back within its dialect, so it sets both ways of the trip; two
// translate (ADR 0006)
function normalizePresetOptions(
  layers: PresetNames[]
): PresetOptions | undefined {
  const input = sideName(layers, "inputPreset")?.name ?? "vanilla"
  const output = sideName(layers, "outputPreset")?.name ?? "vanilla"
  if (input !== output) {
    return undefined
  }
  const preset = createPreset(input)
  return preset ? { preset } : {}
}

/**
 * Resolves the presets of a conversion over layers of names (ADR 0006):
 * per side, the first layer that sets the side or `preset` wins.
 * @param layers Preset names by layer, highest first.
 * @param from The input's format.
 * @param to The output's format.
 * @returns The conversion's preset options.
 * @throws If a layer sets `preset` and another side preset, or a side
 * preset has no dialect for its side's format.
 */
export function resolvePresetOptions(
  layers: PresetNames[],
  from: Format,
  to: Format
): PresetOptions {
  layers.forEach(rejectConflict)
  const normalize = from === to ? normalizePresetOptions(layers) : undefined
  if (normalize) {
    return normalize
  }
  const input = sidePreset(sideName(layers, "inputPreset"), from, "input")
  const output = sidePreset(sideName(layers, "outputPreset"), to, "output")
  return {
    ...(input && { inputPreset: input }),
    ...(output && { outputPreset: output })
  }
}
