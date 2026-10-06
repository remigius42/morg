import type { OrgData, SpecialBlock } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { stringify } from "uniorg-stringify/lib/stringify.js"

// uniorg-parse keeps no special block parameters (`#+begin_tip Title`)
// and uniorg-stringify writes none, where Emacs keeps `:parameters`
export type ParameterizedBlock = SpecialBlock & { parameters?: string }

/**
 * org→md: reads each special block's parameters from its begin line,
 * the line before its contents begin.
 * @param uniorgAst The tree parsed from `source`.
 * @param source The org text the tree was parsed from.
 */
export function readSpecialBlockParameters(
  uniorgAst: OrgData,
  source: string
): void {
  if (!/#\+begin_\S+[ \t]+\S/i.test(source)) {
    return
  }
  visit(uniorgAst as Parent, "special-block", (node: ParameterizedBlock) => {
    const end = source.lastIndexOf("\n", node.contentsBegin - 1)
    const line = source.slice(source.lastIndexOf("\n", end - 1) + 1, end)
    const parameters = /^[ \t]*#\+begin_\S+[ \t]+(.*?)[ \t\r]*$/i.exec(
      line
    )?.[1]
    if (parameters) {
      node.parameters = parameters
    }
  })
}

/**
 * uniorg-stringify handlers that write a special block's parameters,
 * and no blank line for an empty one, wherever morg writes org text.
 */
export const specialBlockHandlers = {
  "special-block": (
    node: ParameterizedBlock,
    options: Parameters<typeof stringify>[1]
  ) => {
    // as uniorg-stringify writes the contents, an empty block's none
    const contents = stringify(node.children, options).trimEnd()
    const parameters = node.parameters ? ` ${node.parameters}` : ""
    return `#+begin_${node.blockType}${parameters}\n${contents && `${contents}\n`}#+end_${node.blockType}\n`
  }
}
