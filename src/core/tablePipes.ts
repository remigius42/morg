import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import type { Node } from "./render.js"

/**
 * md→org: a `|` in a table cell's text (md `\|`) would end the cell; org
 * has no escaped `|`, but renders the `\vert` entity as one, `{}` ending
 * its name before any letter. Runs after the preset, whose wikilink
 * aliases (`[[Page|alias]]`) are no text.
 */
export function escapeTablePipes(tree: Parent): void {
  visit(tree, "table-cell", (cell: Parent) => {
    visit(cell, "text", (node: Node) => {
      node.value = node.value?.replaceAll("|", "\\vert{}")
    })
  })
}
