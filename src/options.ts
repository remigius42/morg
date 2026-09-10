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
   * Preserve Markdown constructs without a native Org equivalent (e.g.
   * raw HTML as export blocks/snippets, see ADR 0002). Default: `true`.
   */
  preserveMdisms?: Toggle
  /**
   * Custom names for org-ism `key::` lines, canonical → custom (e.g.
   * `{ todo: "state" }`). Must match the mapping the file was written
   * with — Convergence is per-config (ADR 0002).
   */
  orgismKeys?: Record<string, string>
  /** Called for each construct dropped without an equivalent. */
  onWarning?: (message: string) => void
  /** Dialect preset applied on top of the generic conversion. */
  preset?: Preset
}

/**
 * Markdown stringifier style knobs (subset of remark-stringify options).
 * Canonical form is parameterized by these (see ADR 0001): round trips
 * must use the same style, and files formatted under one style are not
 * a fixed point under another. Defaults: `-` bullet, `*` emphasis /
 * `*` strong (i.e. `**bold**`), backtick fences, `-` rule — prettier's
 * choices except emphasis (`emphasis: "_"` aligns with prettier).
 */
export interface MarkdownStyleOptions {
  /** Unordered list marker. Default: `"-"`. */
  bullet?: "-" | "*" | "+"
  /** Emphasis (italic) marker. Default: `"*"`. */
  emphasis?: "*" | "_"
  /** Strong (bold) marker, doubled in output. Default: `"*"`. */
  strong?: "*" | "_"
  /** Code fence marker. Default: `` "`" ``. */
  fence?: "`" | "~"
  /** Thematic break marker, tripled in output. Default: `"-"`. */
  rule?: "-" | "*" | "_"
}

export interface OrgToMarkdownOptions {
  /**
   * Serialize Org constructs without a native Markdown equivalent as
   * `key:: value` lines and verbatim passthroughs (see ADR 0002).
   * Default: `true`.
   */
  preserveOrgisms?: Toggle
  /**
   * Render Org constructs without a Markdown equivalent as raw HTML
   * (`<u>`, `<sup>`, `<sub>`, `<dl>`) instead of keeping their org markup
   * verbatim. HTML round-trips as a preserved md-ism (export blocks and
   * snippets), not back to native org markup. Default: `false`.
   */
  useHtml?: Toggle
  /**
   * Map bare `TODO`/`DONE` leaf headlines (no priority, tags or content)
   * to GFM task items (`- [ ]` / `- [x]`). Documented lossy export mode:
   * headings become list items and do not restore to TODO headlines on
   * the return trip; unmappable states keep the heading and warn.
   * Default: `false`.
   */
  taskCheckboxes?: boolean
  /** Markdown output style; canonical form is per-config (ADR 0001). */
  markdownStyle?: MarkdownStyleOptions
  /** Custom names for org-ism `key::` lines, canonical → custom. */
  orgismKeys?: Record<string, string>
  /** Called for each construct dropped without an equivalent. */
  onWarning?: (message: string) => void
  /** Dialect preset extracted before the generic conversion. */
  preset?: Preset
}
