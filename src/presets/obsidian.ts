import type { OrgData, Link, Text } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { toString } from "orgast-util-to-string"
import type { Preset } from "./types.js"

/**
 * Obsidian dialect preset: `[[Page]]` / `[[Page|alias]]` wikilinks map
 * to org fuzzy links (`[[Page]]` / `[[Page][alias]]`).
 */
export function obsidian(): Preset {
  return {
    name: "obsidian",
    applyToUniorg: rewriteAliasedWikilinks,
    extractFromUniorg: fuzzyLinksToWikilinks
  }
}

// md→org: a wikilink travels as plain text; org already reads `[[Page]]`
// as a fuzzy link, only the `[[Page|alias]]` form needs rewriting to
// org's `[[Page][alias]]` description syntax
function rewriteAliasedWikilinks(uniorgAst: OrgData): OrgData {
  visit(uniorgAst as Parent, "text", (node: Text) => {
    node.value = node.value.replace(
      /\[\[([^\][|]+)\|([^\][]+)\]\]/g,
      "[[$1][$2]]"
    )
  })
  return uniorgAst
}

// org→md: fuzzy links become wikilink text; a verbatim-inline node keeps
// the brackets unescaped in the Markdown output
function fuzzyLinksToWikilinks(uniorgAst: OrgData): OrgData {
  visit(
    uniorgAst as Parent,
    "link",
    (node: Link, index: number, parent: Parent) => {
      if (node.linkType !== "fuzzy") {
        return undefined
      }
      const description = node.children.length ? toString(node) : ""
      parent.children[index] = {
        type: "verbatim-inline",
        value: description
          ? `[[${node.rawLink}|${description}]]`
          : `[[${node.rawLink}]]`
      } as unknown as Parent["children"][number]
      return undefined
    }
  )
  return uniorgAst
}
