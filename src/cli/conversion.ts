import { convertMarkdownToOrg } from "../markdownToOrg.js"
import { convertOrgToMarkdown } from "../orgToMarkdown.js"
import {
  normalizeMarkdown,
  normalizeOrg,
  type NormalizeOptions
} from "../normalize.js"
import { translateMarkdown, translateOrg } from "../translate.js"
import type { MorgConfig } from "../config.js"
import { buildConversionOptions as layerOptions } from "../conversionOptions.js"
import type { MarkdownStyleOptions } from "../options.js"
import type { Format, PresetOptions } from "../presets/sides.js"
import type { CliArgs } from "./args.js"
import { CliError } from "./error.js"

export function buildConversionOptions(
  cli: CliArgs,
  config: MorgConfig,
  presets: PresetOptions
) {
  // an explicit --silent wins over the config; dropped constructs are
  // reported on stderr unless it ends up on
  const silent = cli.silent ?? config.silent ?? false
  const onWarning = silent
    ? undefined
    : (message: string) => console.error(`morg: ${message}`)

  // style flags arrive as strings; the numeric one needs converting
  const markdownStyle: MarkdownStyleOptions = {
    ...cli.markdownStyle,
    ...(cli.markdownStyle.ruleRepetition !== undefined && {
      ruleRepetition: Number(cli.markdownStyle.ruleRepetition)
    })
  }
  return layerOptions(
    {
      taskCheckboxes: cli.taskCheckboxes,
      interpretHtml: cli.interpretHtml,
      recordStyle: cli.recordStyle,
      markdownStyle
    },
    config,
    {
      ...presets,
      onWarning,
      ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
    }
  )
}

export function convert(
  inputContent: string,
  fromFormat: Format,
  toFormat: Format,
  cli: CliArgs,
  config: MorgConfig,
  presets: PresetOptions
): string {
  try {
    const { mdToOrgOptions, orgToMdOptions } = buildConversionOptions(
      cli,
      config,
      presets
    )
    if (fromFormat === toFormat) {
      return sameFormat(inputContent, fromFormat, presets, {
        ...mdToOrgOptions,
        ...orgToMdOptions
      })
    }
    if (fromFormat === "markdown") {
      return convertMarkdownToOrg(inputContent, mdToOrgOptions)
    }
    return convertOrgToMarkdown(inputContent, orgToMdOptions)
  } catch (error) {
    throw new CliError("Conversion error:", { cause: error })
  }
}

// one preset on both sides normalizes, two translate (ADR 0006)
function sameFormat(
  inputContent: string,
  format: Format,
  presets: PresetOptions,
  options: NormalizeOptions
): string {
  if (presets.inputPreset || presets.outputPreset) {
    const translate = format === "markdown" ? translateMarkdown : translateOrg
    return translate(inputContent, {
      ...presets,
      ...(options.onWarning && { onWarning: options.onWarning }),
      ...(options.orgismKeys && { orgismKeys: options.orgismKeys })
    })
  }
  return format === "markdown"
    ? normalizeMarkdown(inputContent, options)
    : normalizeOrg(inputContent, options)
}
