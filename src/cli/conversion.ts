import { convertMarkdownToOrg } from "../markdownToOrg.js"
import { convertOrgToMarkdown } from "../orgToMarkdown.js"
import { convertWithinFormat } from "../withinFormat.js"
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
      // --html sets every construct on both sides, as [markdown] would
      interpretHtml: cli.html,
      ...(cli.html !== undefined && {
        spelling: cli.html ? "html" : "markdown"
      }),
      recordMarkdownStyle: cli.recordMarkdownStyle,
      style: markdownStyle
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
      return convertWithinFormat(inputContent, fromFormat, {
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
