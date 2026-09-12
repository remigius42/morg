import { convertMarkdownToOrg } from "../markdownToOrg.js"
import { convertOrgToMarkdown } from "../orgToMarkdown.js"
import { normalizeMarkdown, normalizeOrg } from "../normalize.js"
import type { MorgConfig } from "../config.js"
import { buildConversionOptions as layerOptions } from "../conversionOptions.js"
import type { MarkdownStyleOptions } from "../options.js"
import type { Preset } from "../presets/types.js"
import type { CliArgs } from "./args.js"
import { CliError } from "./error.js"

export function buildConversionOptions(
  cli: CliArgs,
  config: MorgConfig,
  preset: Preset | undefined
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
      markdownStyle
    },
    config,
    {
      preset,
      onWarning,
      ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
    }
  )
}

export function convert(
  inputContent: string,
  fromFormat: string,
  normalize: boolean,
  cli: CliArgs,
  config: MorgConfig,
  preset: Preset | undefined
): string {
  try {
    const { mdToOrgOptions, orgToMdOptions } = buildConversionOptions(
      cli,
      config,
      preset
    )
    if (normalize) {
      return fromFormat === "markdown"
        ? normalizeMarkdown(inputContent, {
            ...mdToOrgOptions,
            ...orgToMdOptions
          })
        : normalizeOrg(inputContent, { ...mdToOrgOptions, ...orgToMdOptions })
    }
    if (fromFormat === "markdown") {
      return convertMarkdownToOrg(inputContent, mdToOrgOptions)
    }
    return convertOrgToMarkdown(inputContent, orgToMdOptions)
  } catch (error) {
    throw new CliError("Conversion error:", { cause: error })
  }
}
