import type { OrgData } from "uniorg"
import type { Preset } from "./types.js"

/**
 * md→org's dialect step: reads the Markdown dialect out of the generic
 * tree, then writes the org dialect into it.
 * @param uniorgAst The tree the generic transform produced.
 * @param preset The dialect preset, if any.
 * @returns The tree in the org dialect.
 */
export function readMarkdownWriteOrg(
  uniorgAst: OrgData,
  preset: Preset | undefined
): OrgData {
  const read = preset?.markdown?.read?.org ?? same
  const write = preset?.org?.write ?? same
  return write(read(uniorgAst))
}

/**
 * org→md's dialect step: reads the org dialect out of the parsed tree,
 * then writes the Markdown dialect into it.
 * @param uniorgAst The parsed org tree.
 * @param preset The dialect preset, if any.
 * @returns The tree, ready for the generic transform.
 */
export function readOrgWriteMarkdown(
  uniorgAst: OrgData,
  preset: Preset | undefined
): OrgData {
  const read = preset?.org?.read ?? same
  const write = preset?.markdown?.write ?? same
  return write(read(uniorgAst))
}

function same(uniorgAst: OrgData): OrgData {
  return uniorgAst
}
