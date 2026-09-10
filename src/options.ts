import type { Preset } from "./presets/types.js"

/**
 * A feature toggle: `true`/`false` switches everything on/off, a record
 * toggles individual constructs by name. Unlisted keys fall back to the
 * flag's default. Mirrors the shape of the (planned) TOML config entries.
 */
export type Toggle = boolean | Record<string, boolean>

export interface MarkdownToOrgOptions {
  /**
   * Preserve Markdown constructs without a native Org equivalent as
   * `morg_`-prefixed org properties (see ADR 0002). Default: `true`.
   * TODO: not consumed yet — no md-ism handlers are implemented.
   */
  preserveMdisms?: Toggle
  /** Dialect preset applied on top of the generic conversion. */
  preset?: Preset
}

export interface OrgToMarkdownOptions {
  /**
   * Serialize Org constructs without a native Markdown equivalent as
   * `key:: value` lines (see ADR 0002). Default: `true`.
   * TODO: not consumed yet — no org-ism handlers are implemented.
   */
  preserveOrgisms?: Toggle
  /** Dialect preset extracted before the generic conversion. */
  preset?: Preset
}
