import type { Parent } from "unist"
import { EXIT, SKIP, visit } from "unist-util-visit"
import { isPassthroughParagraph } from "./lineSyntax.js"
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"
import type { Node } from "./render.js"

// org reads a backslash before a letter as an entity (`\alpha`) or a
// LaTeX fragment (`\Users`, `\foo{x}`), before `(` or `[` as a LaTeX
// fragment too; a zero-width space after the backslash leaves it text
const COMMAND_RE = /\\(?=[A-Za-z([])/g
const ESCAPED_RE = new RegExp(
  String.raw`\\${ZERO_WIDTH_SPACE}(?=[A-Za-z([])`,
  "g"
)

/**
 * md→org: escapes a literal backslash org would read as a command, but
 * not in a passthrough element's org text (`#+begin_export latex`).
 */
export function escapeBackslashCommands(tree: Parent): void {
  visit(tree, (node: Node | Parent, index, parent: Parent | undefined) => {
    if (
      holdsCommand(node) &&
      isPassthroughParagraph(node, index ?? 0, parent)
    ) {
      return SKIP
    }
    if (node.type === "text") {
      const text = node as Node
      text.value = text.value?.replace(COMMAND_RE, `\\${ZERO_WIDTH_SPACE}`)
    }
    return undefined
  })
}

// whether a text in `node` holds a backslash org would read as a
// command: the only paragraphs worth a passthrough check
function holdsCommand(node: Node | Parent): boolean {
  let found = false
  visit(node, "text", (text: Node) => {
    found ||= new RegExp(COMMAND_RE.source).test(text.value ?? "")
    return found ? EXIT : undefined
  })
  return found
}

/**
 * org→md: drops the zero-width spaces `escapeBackslashCommands` inserts.
 */
export function unescapeBackslashCommands(tree: Parent): void {
  visit(tree, "text", (node: Node) => {
    node.value = node.value?.replace(ESCAPED_RE, "\\")
  })
}
