import type { Root as MdastRoot } from "mdast"
import type { OrgData } from "uniorg"

/**
 * A dialect preset: transforms applied on top of the dialect-agnostic core.
 * `applyToMdast` runs in the md→org pipeline before the generic
 * transform, with the Markdown source at hand; `applyToUniorg` runs in the md→org pipeline after the generic transform;
 * `extractFromUniorg` runs in the org→md pipeline before the generic
 * transform, normalizing dialect conventions back to generic uniorg.
 * `convertOrg` and `convertMarkdown` take a whole conversion over, for a
 * dialect whose documents are no single org or Markdown document (an
 * outline of blocks, each its own fragment); `convert` runs the core on
 * a fragment, with the given preset's hooks.
 */
export interface Preset {
  name: string
  applyToMdast?: (mdast: MdastRoot, markdown: string) => void
  applyToUniorg?: (uniorgAst: OrgData) => OrgData
  extractFromUniorg?: (uniorgAst: OrgData) => OrgData
  convertOrg?: (org: string, convert: FragmentConverter) => string
  convertMarkdown?: (markdown: string, convert: FragmentConverter) => string
}

/** Converts a fragment with the core and the given preset's AST hooks. */
export type FragmentConverter = (fragment: string, preset?: Preset) => string
