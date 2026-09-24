import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"
import type { Node } from "./render.js"

// org reads `[fn:` in text as a footnote reference (`[fn:1]`, `[fn::x]`,
// `[fn:a:x]`), at a line start as a definition; a zero-width space after
// the `[` leaves it text
const REFERENCE = "[fn:"
const ESCAPED = `[${ZERO_WIDTH_SPACE}fn:`

/**
 * md→org: escapes a literal `[fn:` in text.
 */
export function escapeFootnoteReferences(tree: Parent): void {
  visit(tree, "text", (node: Node) => {
    node.value = node.value?.replaceAll(REFERENCE, ESCAPED)
  })
}

/**
 * org→md: drops the zero-width spaces `escapeFootnoteReferences`
 * inserts.
 */
export function unescapeFootnoteReferences(tree: Parent): void {
  visit(tree, "text", (node: Node) => {
    node.value = node.value?.replaceAll(ESCAPED, REFERENCE)
  })
}
