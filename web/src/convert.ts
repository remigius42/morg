import { convertMarkdownToOrg } from "../../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../../src/orgToMarkdown.js"
import { parseConfig, type MorgConfig } from "../../src/config.js"
import type { MarkdownStyleOptions, Toggle } from "../../src/options.js"
import { logseq } from "../../src/presets/logseq.js"
import { obsidian } from "../../src/presets/obsidian.js"
import type { Preset } from "../../src/presets/types.js"

const PRESETS: Record<string, () => Preset> = {
  logseq: () => logseq(),
  obsidian: () => obsidian()
}

export type Direction = "md-to-org" | "org-to-md"

/** Form state of the Web UI; unset fields fall back to config, then defaults. */
export interface ConversionForm {
  direction: Direction
  /** Preset name; empty string means none. */
  preset?: string
  useHtml?: Toggle
  taskCheckboxes?: boolean
  markdownStyle?: MarkdownStyleOptions
}

export interface ConversionResult {
  output: string
  warnings: string[]
  error?: string
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

  const presetName = form.preset || config.preset
  let preset: Preset | undefined
  if (presetName) {
    const factory = PRESETS[presetName]
    if (!factory) {
      return {
        output: "",
        warnings,
        error: `Unknown preset '${presetName}'. Available presets: ${Object.keys(PRESETS).join(", ")}`
      }
    }
    preset = factory()
  }

  const shared = {
    onWarning,
    preset,
    ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
  }
  try {
    const output =
      form.direction === "md-to-org"
        ? convertMarkdownToOrg(input, { ...config.markdownToOrg, ...shared })
        : convertOrgToMarkdown(input, {
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
          })
    return { output, warnings }
  } catch (error) {
    return { output: "", warnings, error: `Conversion error: ${String(error)}` }
  }
}
