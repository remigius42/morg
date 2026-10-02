import type { Root as MdastRoot } from "mdast"
import type { OrgData } from "uniorg"

/**
 * A dialect preset: transforms applied on top of the dialect-agnostic core.
 * `applyToMdast` runs in the md→org pipeline before the generic
 * transform, with the Markdown source at hand; `applyToUniorg` runs in the md→org pipeline after the generic transform;
 * `extractFromUniorg` runs in the org→md pipeline before the generic
 * transform, normalizing dialect conventions back to generic uniorg.
 */
export interface Preset {
  name: string
  applyToMdast?: (mdast: MdastRoot, markdown: string) => void
  applyToUniorg?: (uniorgAst: OrgData) => OrgData
  extractFromUniorg?: (uniorgAst: OrgData) => OrgData
}
