import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { normalizeMarkdown, normalizeOrg } from "../../src/normalize.js"
import { parseConfig, type MorgConfig } from "../../src/config.js"
import type { MarkdownStyleOptions, Toggle } from "../../src/options.js"
import { logseq } from "../../src/presets/logseq.js"
import { obsidian } from "../../src/presets/obsidian.js"
import type { Preset } from "../../src/presets/types.js"

const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

export type Direction =
  "md-to-org" | "org-to-md" | "normalize-md" | "normalize-org"

/** Form state of the Web UI; unset fields fall back to config, then defaults. */
export interface ConversionForm {
  direction: Direction
  /** Preset name; empty string means none. */
  preset?: string
  useHtml?: Toggle
  interpretHtml?: boolean
  taskCheckboxes?: boolean
  markdownStyle?: MarkdownStyleOptions
}

export interface ConversionResult {
  output: string
  warnings: string[]
  error?: string
}

function resolvePreset(
  presetName: string | undefined
): { preset?: Preset } | { error: string } {
  if (!presetName) {
    return {}
  }
  const factory = PRESETS[presetName]
  if (!factory) {
    return {
      error: `Unknown preset '${presetName}'. Available presets: ${Object.keys(PRESETS).join(", ")}`
    }
  }
  return { preset: factory() }
}

function buildOptions(
  form: ConversionForm,
  config: MorgConfig,
  shared: object
): {
  mdToOrgOptions: Parameters<typeof convertMarkdownToOrg>[1]
  orgToMdOptions: Parameters<typeof convertOrgToMarkdown>[1]
} {
  const mdToOrgOptions = {
    ...config.markdownToOrg,
    ...shared,
    ...(form.interpretHtml !== undefined && {
      interpretHtml: form.interpretHtml
    })
  }
  const orgToMdOptions = {
    ...config.orgToMarkdown,
    ...shared,
    ...(form.useHtml !== undefined && { useHtml: form.useHtml }),
    ...(form.taskCheckboxes !== undefined && {
      taskCheckboxes: form.taskCheckboxes
    }),
    markdownStyle: {
      ...config.orgToMarkdown?.markdownStyle,
      ...form.markdownStyle
    }
  }
  return { mdToOrgOptions, orgToMdOptions }
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

  const resolved = resolvePreset(form.preset || config.preset)
  if ("error" in resolved) {
    return { output: "", warnings, error: resolved.error }
  }

  const shared = {
    onWarning,
    preset: resolved.preset,
    ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
  }
  const { mdToOrgOptions, orgToMdOptions } = buildOptions(form, config, shared)
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
