import type { Root as MdastRoot } from "mdast"
import type { OrgData } from "uniorg"

/**
 * A dialect preset: transforms applied on top of the dialect-agnostic
 * core, one dialect per format it knows (ADR 0006), each read in one
 * direction and written in the other. `convertOrg` and
 * `convertMarkdown` take a whole conversion over, for a dialect whose
 * documents are no single org or Markdown document (an outline of
 * blocks, each its own fragment); `convert` runs the core on a fragment,
 * with the given preset's hooks. `translateOrg` and `translateMarkdown`
 * translate a page between the preset's dialect of the format and
 * Vanilla.
 */
export interface Preset {
  name: string
  markdown?: MarkdownDialect
  org?: OrgDialect
  convertOrg?: (
    org: string,
    convert: FragmentConverter,
    context: ConversionContext
  ) => string
  convertMarkdown?: (
    markdown: string,
    convert: FragmentConverter,
    context: ConversionContext
  ) => string
  translateOrg?: (org: string, context: ConversionContext) => string
  translateMarkdown?: (markdown: string, context: ConversionContext) => string
}

/**
 * What a preset that takes a whole conversion over learns of it: the
 * side or sides it is on (the other one is another preset's or
 * Vanilla), and the conversion's warning callback and org-ism key names.
 */
export interface ConversionContext {
  side: "both" | "input" | "output"
  onWarning?: (message: string) => void
  orgismKeys?: Record<string, string>
  /**
   * A translation's page links from the input's dialect into the
   * output's, in a table's text or not.
   */
  relink?: (text: string, inTable: boolean) => string
}

/**
 * Converts a fragment with the core, the given preset's AST hooks on
 * the taking-over preset's side or sides, and the other side's preset;
 * a Vanilla side converts with `carried`, the preset whose syntax it
 * carries.
 */
export type FragmentConverter = (
  fragment: string,
  preset?: Preset,
  carried?: Preset
) => string

/**
 * A preset's Markdown dialect. `read` runs in md→org: `source` on the
 * text, before the parse; `mdast` on the parse, before the generic
 * transform, with the source at hand; `org` after it. `write` runs in
 * org→md before the generic transform.
 */
export interface MarkdownDialect {
  read?: {
    source?: (markdown: string) => string
    mdast?: (mdast: MdastRoot, markdown: string) => void
    org?: (uniorgAst: OrgData) => OrgData
  }
  write?: (uniorgAst: OrgData) => OrgData
  /**
   * Its page links in Markdown text to org's fuzzy link syntax
   * (`[[Page][label]]`) and back, for a translation between two
   * dialects; `write` is told if the text is in a table.
   */
  links?: {
    read: (text: string) => string
    write: (text: string, inTable: boolean) => string
  }
  /**
   * Whether it writes a special block as a callout, its type lower case
   * and a fold next to the marker (`[!tip]- T` ↔ `#+begin_tip - T`), and
   * reads that fold, not as a GFM alert.
   */
  callouts?: boolean
  /** The bullet its outline needs, which no style may change. */
  bullet?: "-" | "*" | "+"
}

/**
 * A preset's org dialect. `read` runs in org→md before the generic
 * transform, ahead of the Markdown dialect's `write`; `write` runs in
 * md→org after the Markdown dialect was read.
 */
export interface OrgDialect {
  read?: (uniorgAst: OrgData) => OrgData
  write?: (uniorgAst: OrgData) => OrgData
}
