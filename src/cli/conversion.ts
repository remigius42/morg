import { convertMarkdownToOrg } from "../markdownToOrg.js"
import { convertOrgToMarkdown } from "../orgToMarkdown.js"
import { normalizeMarkdown, normalizeOrg } from "../normalize.js"
import type { MorgConfig } from "../config.js"
import type { MarkdownStyleOptions } from "../options.js"
import type { Preset } from "../presets/types.js"
import type { CliArgs } from "./args.js"
import { CliError } from "./error.js"

export function buildConversionOptions(
  cli: CliArgs,
  config: MorgConfig,
  preset: Preset | undefined
) {
  const silent = cli.silent || config.silent === true
  const taskCheckboxes =
    cli.taskCheckboxes || config.orgToMarkdown?.taskCheckboxes === true
  const interpretHtml =
    cli.interpretHtml || config.markdownToOrg?.interpretHtml === true

  // dropped constructs are reported on stderr unless -s / --silent
  const onWarning = silent
    ? undefined
    : (message: string) => console.error(`morg: ${message}`)

  // config values first, CLI flags layered on top
  const style: MarkdownStyleOptions = {
    ...config.orgToMarkdown?.markdownStyle,
    ...cli.markdownStyle,
    ...(cli.markdownStyle.ruleRepetition !== undefined && {
      ruleRepetition: Number(cli.markdownStyle.ruleRepetition)
    })
  }
  const shared = {
    preset,
    onWarning,
    ...(config.orgismKeys && { orgismKeys: config.orgismKeys })
  }
  const mdToOrgOptions = { ...config.markdownToOrg, ...shared, interpretHtml }
  const orgToMdOptions = {
    ...config.orgToMarkdown,
    ...shared,
    taskCheckboxes,
    markdownStyle: style
  }
  return { mdToOrgOptions, orgToMdOptions }
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
