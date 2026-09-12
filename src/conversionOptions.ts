import type { MorgConfig } from "./config.js"
import type {
  MarkdownStyleOptions,
  MarkdownToOrgOptions,
  OrgToMarkdownOptions,
  Toggle
} from "./options.js"
import type { Preset } from "./presets/types.js"

/** Explicitly requested option values; `undefined` leaves it to config. */
export interface ConversionOverrides {
  taskCheckboxes?: boolean
  interpretHtml?: boolean
  useHtml?: Toggle
  markdownStyle?: MarkdownStyleOptions
}

/** Values that apply to both directions. */
export interface SharedConversionOptions {
  preset?: Preset
  onWarning?: (message: string) => void
  orgismKeys?: Record<string, string>
}

/**
 * Layers explicit overrides over the config file, per direction. Used by
 * both adapters (CLI and Web UI) so the documented precedence — CLI or
 * form > config > defaults — means the same thing in each.
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
