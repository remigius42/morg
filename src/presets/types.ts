import type { OrgData } from "uniorg"

/**
 * A dialect preset: transforms applied on top of the dialect-agnostic core.
 * `applyToUniorg` runs in the md→org pipeline after the generic transform;
 * `extractFromUniorg` runs in the org→md pipeline before the generic
 * transform, normalizing dialect conventions back to generic uniorg.
 */
export interface Preset {
  name: string
  applyToUniorg?: (uniorgAst: OrgData) => OrgData
  extractFromUniorg?: (uniorgAst: OrgData) => OrgData
}
