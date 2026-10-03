import type { OrgData } from "uniorg"
import type { Sides } from "./sides.js"
import type { ConversionContext, Preset } from "./types.js"

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

/** A preset that takes a whole conversion over, and the side it is on. */
export interface TakeOver {
  preset: Preset
  side: ConversionContext["side"]
}

/**
 * Finds the preset that takes the conversion over, if any: the input's,
 * else the output's.
 * @param sides The preset per side.
 * @param hook The hook that takes this direction over.
 * @returns The preset and its side, or `undefined` for none.
 */
export function takeOver(
  { input, output }: Sides,
  hook: "convertOrg" | "convertMarkdown"
): TakeOver | undefined {
  if (input?.[hook]) {
    return {
      preset: input,
      side: input.name === output?.name ? "both" : "input"
    }
  }
  return output?.[hook] ? { preset: output, side: "output" } : undefined
}

/**
 * The sides a fragment converts with: the fragment's preset on the
 * taking-over preset's side or sides, the other side as it was.
 * @param sides The conversion's preset per side.
 * @param side The taking-over preset's side.
 * @param preset The fragment's preset.
 * @returns The fragment's preset per side.
 */
export function fragmentSides(
  sides: Sides,
  side: ConversionContext["side"],
  preset: Preset | undefined
): Sides {
  return {
    input: side === "output" ? sides.input : preset,
    output: side === "input" ? sides.output : preset
  }
}

/**
 * The context a taking-over preset converts in.
 * @param over The taking-over preset and its side.
 * @param options The conversion's options.
 * @returns The context.
 */
export function conversionContext(
  over: TakeOver,
  options: Pick<ConversionContext, "onWarning" | "orgismKeys">
): ConversionContext {
  return {
    side: over.side,
    ...(options.onWarning && { onWarning: options.onWarning }),
    ...(options.orgismKeys && { orgismKeys: options.orgismKeys })
  }
}
