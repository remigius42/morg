import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import type { Node } from "./render.js"

// org has no escape inside ~code~ or =verbatim=: a `|` there would end
// the cell, so a lookalike (U+2223 DIVIDES) stands in for it
const LOOKALIKE = "∣"

/**
 * md→org: a `|` in a table cell's text (md `\|`) would end the cell; org
 * has no escaped `|`, but renders the `\vert` entity as one, `{}` ending
 * its name before any letter. In code, where the entity would be
 * literal, the lookalike stands in, which is reported. Runs after the
 * preset, whose wikilink aliases (`[[Page|alias]]`) are no text.
 * @param tree The document.
 * @param onWarning Reports a lookalike written.
 */
export function escapeTablePipes(
  tree: Parent,
  onWarning?: (message: string) => void
): void {
  let replaced = false
  visit(tree, "table-cell", (cell: Parent) => {
    visit(cell, (node: Node) => {
      if (node.type === "text") {
        node.value = node.value?.replaceAll("|", "\\vert{}")
      } else if (isCode(node) && node.value?.includes("|")) {
        node.value = node.value.replaceAll("|", LOOKALIKE)
        replaced = true
      }
    })
  })
  if (replaced) {
    onWarning?.("a | in code in a table cell becomes ∣ (U+2223) in org")
  }
}

/**
 * org→md: the lookalike in code in a table cell back to the `|` it
 * stands in for.
 * @param tree The document.
 */
export function unescapeTablePipes(tree: Parent): void {
  visit(tree, "table-cell", (cell: Parent) => {
    visit(cell, (node: Node) => {
      if (isCode(node)) {
        node.value = node.value?.replaceAll(LOOKALIKE, "|")
      }
    })
  })
}

function isCode(node: Node): boolean {
  return node.type === "code" || node.type === "verbatim"
}
