import type { Root as MdastRoot } from "mdast"
import type { OrgData } from "uniorg"

/**
 * A dialect preset: transforms applied on top of the dialect-agnostic
 * core, one dialect per format it knows (ADR 0006), each read in one
 * direction and written in the other. `convertOrg` and
 * `convertMarkdown` take a whole conversion over, for a dialect whose
 * documents are no single org or Markdown document (an outline of
 * blocks, each its own fragment); `convert` runs the core on a fragment,
 * with the given preset's hooks.
 */
export interface Preset {
  name: string
  markdown?: MarkdownDialect
  org?: OrgDialect
  convertOrg?: (org: string, convert: FragmentConverter) => string
  convertMarkdown?: (markdown: string, convert: FragmentConverter) => string
}

/** Converts a fragment with the core and the given preset's AST hooks. */
export type FragmentConverter = (fragment: string, preset?: Preset) => string

/**
 * A preset's Markdown dialect. `read` runs in md→org: `mdast` on the
 * parse, before the generic transform, with the source at hand; `org`
 * after it. `write` runs in org→md before the generic transform.
 */
export interface MarkdownDialect {
  read?: {
    mdast?: (mdast: MdastRoot, markdown: string) => void
    org?: (uniorgAst: OrgData) => OrgData
  }
  write?: (uniorgAst: OrgData) => OrgData
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
