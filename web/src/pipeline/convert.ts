import { convertMarkdownToOrg } from "../../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../../src/orgToMarkdown.js"
import { normalizeMarkdown, normalizeOrg } from "../../../src/normalize.js"
import { parseConfig, type MorgConfig } from "../../../src/config.js"
import {
  buildConversionOptions,
  resolvePresetOptions
} from "../../../src/conversionOptions.js"
import type { MarkdownStyleOptions, Toggle } from "../../../src/options.js"
import type { Format, PresetOptions } from "../../../src/presets/sides.js"
import { createPreset } from "../../../src/presets/registry.js"
import type { Direction } from "../direction.js"

/** Form state of the Web UI; unset fields fall back to config, then defaults. */
export interface ConversionForm {
  direction: Direction
  /** Preset names per side; unset defers to the config. */
  inputPreset?: string
  outputPreset?: string
  useHtml?: Toggle
  interpretHtml?: boolean
  recordStyle?: boolean
  taskCheckboxes?: boolean
  markdownStyle?: MarkdownStyleOptions
}

export interface ConversionResult {
  output: string
  warnings: string[]
  error?: string
}

// the formats a direction reads and writes
const FORMATS: Record<Direction, [Format, Format]> = {
  "md-to-org": ["markdown", "org"],
  "org-to-md": ["org", "markdown"],
  "normalize-md": ["markdown", "markdown"],
  "normalize-org": ["org", "org"]
}

// per side, the form over the config (ADR 0006)
function resolvePresets(
  form: ConversionForm,
  config: MorgConfig
): PresetOptions | { error: string } {
  const formats = FORMATS[form.direction] as [Format, Format] | undefined
  if (!formats) {
    // convert() reports the direction
    return {}
  }
  const names = {
    ...(form.inputPreset && { inputPreset: form.inputPreset }),
    ...(form.outputPreset && { outputPreset: form.outputPreset })
  }
  try {
    // the form names both sides, so the config's names would never be
    // looked up; one that names no preset is a mistake all the same
    for (const name of [config.preset, config.inputPreset, config.outputPreset])
      createPreset(name)
    return resolvePresetOptions([names, config], ...formats)
  } catch (error) {
    return { error: (error as Error).message }
  }
}

function convert(
  input: string,
  direction: Direction,
  mdToOrgOptions: Parameters<typeof convertMarkdownToOrg>[1],
  orgToMdOptions: Parameters<typeof convertOrgToMarkdown>[1]
): string {
  switch (direction) {
    case "md-to-org":
      return convertMarkdownToOrg(input, mdToOrgOptions)
    case "org-to-md":
      return convertOrgToMarkdown(input, orgToMdOptions)
    case "normalize-md":
      return normalizeMarkdown(input, { ...mdToOrgOptions, ...orgToMdOptions })
    case "normalize-org":
      return normalizeOrg(input, { ...mdToOrgOptions, ...orgToMdOptions })
    default:
      // out-of-union value, e.g. from a stale persisted form state
      throw new Error(`Unknown direction '${String(direction)}'`)
  }
}

/**
 * Runs one conversion for the Web UI, collecting warnings instead of
 * printing them. Precedence mirrors the CLI: form > config > defaults.
 */
export function runConversion(
  input: string,
  form: ConversionForm,
  configSource?: string
): ConversionResult {
  const warnings: string[] = []
  const onWarning = (message: string) => warnings.push(message)

  let config: MorgConfig = {}
  if (configSource?.trim()) {
    try {
      config = parseConfig(configSource)
    } catch (error) {
      return { output: "", warnings, error: `Invalid config: ${String(error)}` }
    }
  }

  const presets = resolvePresets(form, config)
  if ("error" in presets) {
    return { output: "", warnings, error: presets.error }
  }

  const shared = {
    onWarning,
    ...presets,
    ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
  }
  const { mdToOrgOptions, orgToMdOptions } = buildConversionOptions(
    {
      interpretHtml: form.interpretHtml,
      recordStyle: form.recordStyle,
      useHtml: form.useHtml,
      taskCheckboxes: form.taskCheckboxes,
      markdownStyle: form.markdownStyle
    },
    config,
    shared
  )
  try {
    const output = convert(
      input,
      form.direction,
      mdToOrgOptions,
      orgToMdOptions
    )
    return { output, warnings }
  } catch (error) {
    return { output: "", warnings, error: `Conversion error: ${String(error)}` }
  }
}
