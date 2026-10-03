import type { OrgData } from "uniorg"
import type { Sides } from "./sides.js"

/**
 * md→org's dialect step: reads the Markdown dialect out of the generic
 * tree, then writes the org dialect into it.
 * @param uniorgAst The tree the generic transform produced.
 * @param sides The preset per side.
 * @returns The tree in the org dialect.
 */
export function readMarkdownWriteOrg(
  uniorgAst: OrgData,
  { input, output }: Sides
): OrgData {
  const read = input?.markdown?.read?.org ?? same
  const write = output?.org?.write ?? same
  return write(read(uniorgAst))
}

/**
 * org→md's dialect step: reads the org dialect out of the parsed tree,
 * then writes the Markdown dialect into it.
 * @param uniorgAst The parsed org tree.
 * @param sides The preset per side.
 * @returns The tree, ready for the generic transform.
 */
export function readOrgWriteMarkdown(
  uniorgAst: OrgData,
  { input, output }: Sides
): OrgData {
  const read = input?.org?.read ?? same
  const write = output?.markdown?.write ?? same
  return write(read(uniorgAst))
}

function same(uniorgAst: OrgData): OrgData {
  return uniorgAst
}
