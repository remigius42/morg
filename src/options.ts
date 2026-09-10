import type { Preset } from "./presets/types.js"

/**
 * A feature toggle: `true`/`false` switches everything on/off, a record
 * toggles individual constructs by name. Unlisted keys fall back to the
 * flag's default. Mirrors the shape of the (planned) TOML config entries.
 */
export type Toggle = boolean | Record<string, boolean>

export function toggleEnabled(
  toggle: Toggle | undefined,
  key: string,
  defaultValue = true
): boolean {
  if (toggle === undefined) {
    return defaultValue
  }
  if (typeof toggle === "boolean") {
    return toggle
  }
  return toggle[key] ?? defaultValue
}

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
  /**
   * Render Org constructs without a Markdown equivalent as raw HTML
   * (`<u>`, `<sup>`, `<sub>`, `<dl>`) instead of keeping their org markup
   * verbatim. HTML round-trips as a preserved md-ism (export blocks and
   * snippets), not back to native org markup. Default: `false`.
   */
  useHtml?: Toggle
  /** Dialect preset extracted before the generic conversion. */
  preset?: Preset
}
