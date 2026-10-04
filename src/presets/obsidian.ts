import type { OrgData, Link, Text } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { toString } from "orgast-util-to-string"
import { mapOutsideCode } from "../core/outsideCode.js"
import type { Preset } from "./types.js"

/**
 * Obsidian dialect preset: `[[Page]]` / `[[Page|alias]]` wikilinks map
 * to org fuzzy links (`[[Page]]` / `[[Page][alias]]`).
 */
export function obsidian(): Preset {
  return {
    name: "obsidian",
    markdown: {
      read: { org: rewriteAliasedWikilinks },
      write: fuzzyLinksToWikilinks,
      links: {
        read: text => text.replace(ALIASED_WIKILINK_RE, "[[$1][$2]]"),
        write: text => text.replace(FUZZY_LINK_RE, "[[$1|$2]]")
      }
    },
    // Vanilla Markdown reads Obsidian's own syntax but for these; the
    // way back has nothing to do
    translateMarkdown: (markdown, context) =>
      context.side === "input" ? toVanilla(markdown) : markdown
  }
}

const ALIASED_WIKILINK_RE = /\[\[([^\][|]+)\|([^\][]+)\]\]/g
const FUZZY_LINK_RE = /\[\[([^\][]+)\]\[([^\][]+)\]\]/g

// md→org: a wikilink travels as plain text; org already reads `[[Page]]`
// as a fuzzy link, only the `[[Page|alias]]` form needs rewriting to
// org's `[[Page][alias]]` description syntax
function rewriteAliasedWikilinks(uniorgAst: OrgData): OrgData {
  visit(uniorgAst as Parent, "text", (node: Text) => {
    node.value = node.value.replace(ALIASED_WIKILINK_RE, "[[$1][$2]]")
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

const COMMENT_RE = /%%([\s\S]*?)%%/g
const FOOTNOTE_LABEL_RE = /\[\^(\d+)\]/g

// Obsidian Markdown → Vanilla Markdown: a comment is an HTML comment,
// an inline footnote a footnote, numbered on from the page's own, its
// definition at the end
function toVanilla(markdown: string): string {
  let next =
    Math.max(
      0,
      ...[...markdown.matchAll(FOOTNOTE_LABEL_RE)].map(([, n]) => Number(n))
    ) + 1
  const definitions: string[] = []
  const result = mapOutsideCode(markdown, text =>
    inlineFootnotes(text.replace(COMMENT_RE, "<!--$1-->"), note => {
      definitions.push(`[^${next}]: ${note}`)
      return `[^${next++}]`
    })
  )
  return definitions.length
    ? `${result.replace(/\n*$/, "")}\n\n${definitions.join("\n")}\n`
    : result
}

// each `^[note]`, its brackets balanced, as the reference it becomes
function inlineFootnotes(
  text: string,
  reference: (note: string) => string
): string {
  let result = ""
  let from = 0
  for (let start = text.indexOf("^["); start !== -1;) {
    let depth = 0
    let end = start + 1
    for (; end < text.length; end++) {
      depth += text[end] === "[" ? 1 : text[end] === "]" ? -1 : 0
      if (!depth) {
        break
      }
    }
    if (end === text.length) {
      break
    }
    result += text.slice(from, start) + reference(text.slice(start + 2, end))
    from = end + 1
    start = text.indexOf("^[", from)
  }
  return result + text.slice(from)
}
