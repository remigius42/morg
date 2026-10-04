import type { OrgData, Link, Text } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { toString } from "orgast-util-to-string"
import { maskCode } from "../core/outsideCode.js"
import { FUZZY_LINK_RE } from "./links.js"
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
        read: text => text.replace(ALIASED_PAGE_LINK_RE, "[[$1][$2]]"),
        // a bare `|` would split a table's cell
        write: (text, inTable) =>
          text.replace(FUZZY_LINK_RE, inTable ? "[[$1\\|$2]]" : "[[$1|$2]]")
      }
    },
    // Vanilla Markdown reads Obsidian's own syntax but for these; the
    // way back has nothing to do
    translateMarkdown: (markdown, context) =>
      context.side === "input" ? toVanilla(markdown) : markdown
  }
}

// not an embed, whose `|300` is a size
const ALIASED_WIKILINK_RE = /(?<!!)\[\[([^\][|]+)\|([^\][]+)\]\]/g
// in Markdown text: not an embed, whose `|300` is a size, and with a
// table cell's escaped pipe (`[[Page\|alias]]`)
const ALIASED_PAGE_LINK_RE = /(?<!!)\[\[([^\][|\\]+)\\?\|([^\][]+)\]\]/g

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

type Edit = [start: number, end: number, text: string]

// Obsidian Markdown → Vanilla Markdown: a comment is an HTML comment,
// an inline footnote a footnote, numbered on from the page's own, its
// definition at the end; their delimiters count outside code only, what
// they hold may be code
function toVanilla(markdown: string): string {
  let masked = maskCode(markdown)
  const edits: Edit[] = []
  for (const { index, 0: comment } of masked.matchAll(COMMENT_RE)) {
    const end = index + comment.length
    edits.push([index, end, `<!--${markdown.slice(index + 2, end - 2)}-->`])
    // a footnote in a comment is part of it
    masked =
      masked.slice(0, index) + "\0".repeat(comment.length) + masked.slice(end)
  }
  let next =
    Math.max(
      0,
      ...[...markdown.matchAll(FOOTNOTE_LABEL_RE)].map(([, n]) => Number(n))
    ) + 1
  const definitions: string[] = []
  for (const [start, end] of inlineFootnotes(masked)) {
    definitions.push(`[^${next}]: ${markdown.slice(start + 2, end)}`)
    edits.push([start, end + 1, `[^${next++}]`])
  }
  let result = markdown
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + text + result.slice(end)
  }
  return definitions.length
    ? `${result.replace(/\n*$/, "")}\n\n${definitions.join("\n")}\n`
    : result
}

// each `^[note]`, its brackets balanced: where it starts, and its `]`
function inlineFootnotes(text: string): [number, number][] {
  const notes: [number, number][] = []
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
    notes.push([start, end])
    start = text.indexOf("^[", end + 1)
  }
  return notes
}
