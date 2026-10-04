import type { PresetOptions } from "./presets/sides.js"

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

/**
 * The org constructs Markdown cannot spell losslessly in its own syntax
 * but HTML can (ADR 0007): each has a Spelling to write and an HTML
 * spelling to read.
 */
export const HTML_CONSTRUCTS = [
  "definitionList",
  "images",
  "underline",
  "superscript",
  "subscript"
] as const

export type HtmlConstruct = (typeof HTML_CONSTRUCTS)[number]

/** How Markdown writes a construct: its own syntax, or HTML. */
export type Spelling = "markdown" | "html"

/** One Spelling for every construct, or one per construct. */
export type Spellings = Spelling | Partial<Record<HtmlConstruct, Spelling>>

export function spellingOf(
  spellings: Spellings | undefined,
  construct: HtmlConstruct
): Spelling {
  if (spellings === undefined || typeof spellings === "string") {
    return spellings ?? "markdown"
  }
  return spellings[construct] ?? "markdown"
}

export interface MarkdownToOrgOptions extends PresetOptions {
  /**
   * Preserve Markdown constructs without a native Org equivalent (e.g.
   * raw HTML as export blocks/snippets, see ADR 0002). Default: `true`.
   */
  preserveMdisms?: Toggle
  /**
   * Read a construct's HTML spelling (`<dl>`, `<u>`, `<sup>`, `<sub>`,
   * bare, without attributes; `<img>` with `src`, `alt`, `width` and
   * `height` only) as the native Org construct, per
   * construct (ADR 0007); its Markdown spelling is always read. Any
   * other HTML still preserves per `preserveMdisms`. Default: `false`.
   */
  interpretHtml?: Toggle
  /**
   * Record the Markdown style knobs detected in the source as a
   * `#+MORG_MARKDOWN_STYLE:` keyword, so the return trip restores the source's own
   * markers instead of morg's canonical ones (ADR 0004). Widens the set
   * of inputs the Round Trip leaves untouched; it does not replace
   * Convergence. Knobs used inconsistently are not recorded and warn.
   * Default: `false`.
   */
  recordMarkdownStyle?: boolean
  /**
   * Custom names for org-ism `key::` lines, canonical → custom (e.g.
   * `{ todo: "state" }`). Must match the mapping the file was written
   * with, since Convergence is per-config (ADR 0002).
   */
  orgismKeys?: Record<string, string>
  /** Called for each construct dropped without an equivalent. */
  onWarning?: (message: string) => void
}

/**
 * Markdown stringifier style knobs (subset of remark-stringify options).
 * Canonical form is parameterized by these (see ADR 0001): round trips
 * must use the same style, and files formatted under one style are not
 * a fixed point under another. Defaults: `-` bullet, `*` emphasis /
 * `*` strong (i.e. `**bold**`), backtick fences, `-` rule: prettier's
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
  /**
   * How often to repeat the thematic break marker (minimum 3).
   * Default: `3`. mdformat writes 70 underscores (`rule: "_"`,
   * `ruleRepetition: 70`).
   */
  ruleRepetition?: number
}

export interface OrgToMarkdownOptions extends PresetOptions {
  /**
   * Serialize Org constructs without a native Markdown equivalent as
   * `key:: value` lines and verbatim passthroughs (see ADR 0002).
   * Default: `true`.
   */
  preserveOrgisms?: Toggle
  /**
   * The Spelling to write each construct in (ADR 0007): `"markdown"`,
   * its own syntax, or verbatim org text where Markdown has none, or
   * `"html"` (`<dl>`, `<img>` for an image with a size, `<u>`, `<sup>`,
   * `<sub>`). HTML reads back as the
   * construct where `interpretHtml` asks, else as a preserved md-ism.
   * Default: `"markdown"`.
   */
  spelling?: Spellings
  /**
   * Map bare `TODO`/`DONE` leaf headlines (no priority, tags or content)
   * to GFM task items (`- [ ]` / `- [x]`). Documented lossy export mode:
   * headings become list items and do not restore to TODO headlines on
   * the return trip; unmappable states keep the heading and warn.
   * Default: `false`.
   */
  taskCheckboxes?: boolean
  /** Markdown output style; canonical form is per-config (ADR 0001). */
  style?: MarkdownStyleOptions
  /** Custom names for org-ism `key::` lines, canonical → custom. */
  orgismKeys?: Record<string, string>
  /** Called for each construct dropped without an equivalent. */
  onWarning?: (message: string) => void
}
