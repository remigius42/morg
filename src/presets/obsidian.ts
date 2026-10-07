import type { OrgData, Link, Paragraph, Text } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { toString } from "orgast-util-to-string"
import { maskCode } from "../core/outsideCode.js"
import { FUZZY_LINK_RE } from "./links.js"
import {
  loneAttrHtmlSize,
  attrHtmlValue,
  IMAGE_EXTENSION_RE,
  loneImageLink,
  type ImageSize
} from "../core/sizedImages.js"
import { applyEdits, type Edit } from "../core/edits.js"
import type { Preset } from "./types.js"

/**
 * Obsidian dialect preset: `[[Page]]` / `[[Page|alias]]` wikilinks map
 * to org fuzzy links (`[[Page]]` / `[[Page][alias]]`).
 */
export function obsidian(): Preset {
  return {
    name: "obsidian",
    markdown: {
      read: { org: tree => readImageSizes(rewriteAliasedWikilinks(tree)) },
      write: tree => fuzzyLinksToWikilinks(writeImageSizes(tree)),
      callouts: true,
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
      context.side === "input" ? toVanilla(markdown) : fromVanilla(markdown)
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
// the brackets unescaped in the Markdown output. A link to a headline
// (`[[*Heading]]`) stays a link to its anchor, as core writes it
function fuzzyLinksToWikilinks(uniorgAst: OrgData): OrgData {
  visit(
    uniorgAst as Parent,
    "link",
    (node: Link, index: number, parent: Parent) => {
      if (node.linkType !== "fuzzy" || node.rawLink.startsWith("*")) {
        return undefined
      }
      const description = node.children.length ? toString(node) : ""
      // an embed's `!` goes with it, else Markdown escapes it before `[`
      const previous = parent.children[index - 1] as Text | undefined
      const embed = previous?.type === "text" && previous.value.endsWith("!")
      if (embed) {
        previous.value = previous.value.slice(0, -1)
      }
      parent.children[index] = {
        type: "verbatim-inline",
        value: `${embed ? "!" : ""}${
          description
            ? `[[${node.rawLink}|${description}]]`
            : `[[${node.rawLink}]]`
        }`
      } as unknown as Parent["children"][number]
      return undefined
    }
  )
  return uniorgAst
}

// an image's size in its alt text: `![alt|300](img.png)`, `|300x200`
const SIZE_SUFFIX_RE = /^([^]*)\|(\d+)(?:x(\d+))?$/
const DIGITS_RE = /^\d+$/

function sizeOf(width: string | undefined, height: string | undefined) {
  return { width, ...(height !== undefined && { height }) } as ImageSize
}

// md→org: a lone image's `|300` is its #+ATTR_HTML: size (ADR 0007)
function readImageSizes(uniorgAst: OrgData): OrgData {
  visit(
    uniorgAst as Parent,
    "paragraph",
    (node: Paragraph, _index: number, parent: Parent) => {
      const link = loneImageLink(node, parent)
      const affiliated = node.affiliated ?? {}
      const size =
        link?.children.every(child => child.type === "text") &&
        SIZE_SUFFIX_RE.exec(toString(link))
      if (!link || !size || affiliated.ATTR_HTML) {
        return undefined
      }
      const [, alt, width, height] = size
      link.children = alt ? [{ type: "text", value: alt }] : []
      node.affiliated = {
        ...affiliated,
        ATTR_HTML: [attrHtmlValue(sizeOf(width, height))]
      }
      return undefined
    }
  )
  return uniorgAst
}

// the size Obsidian spells: a width, and maybe a height, in pixels
function obsidianSize(attrHtml: unknown): ImageSize | undefined {
  const size = loneAttrHtmlSize(attrHtml)
  return size?.width !== undefined &&
    DIGITS_RE.test(size.width) &&
    (size.height === undefined || DIGITS_RE.test(size.height))
    ? size
    : undefined
}

function sizeSuffix({ width, height }: ImageSize): string {
  return `|${width}${height === undefined ? "" : `x${height}`}`
}

// org→md: a lone image's #+ATTR_HTML: size is its `|300`, Obsidian's own
// spelling, over the html one
function writeImageSizes(uniorgAst: OrgData): OrgData {
  visit(
    uniorgAst as Parent,
    "paragraph",
    (node: Paragraph, _index: number, parent: Parent) => {
      const link = loneImageLink(node, parent)
      const { ATTR_HTML: attrHtml, ...others } = node.affiliated ?? {}
      const size = obsidianSize(attrHtml)
      if (!link || !size) {
        return undefined
      }
      const alt = link.children.length ? toString(link) : ""
      link.children = [{ type: "text", value: alt + sizeSuffix(size) }]
      node.affiliated = others
      return undefined
    }
  )
  return uniorgAst
}

// a lone image line in Markdown, its paragraph's only line
const LONE_IMAGE = String.raw`!\[([^\]\n]*)\]\(([^()\s]+)\)[ \t]*(?=\n\n|\n?$)`
const SIZED_IMAGE_RE = new RegExp(String.raw`(?<=^|\n\n)${LONE_IMAGE}`, "g")
const ATTR_HTML_IMAGE_RE = new RegExp(
  String.raw`(?<=^|\n)#\+ATTR_HTML:[ \t]+([^\n]*)\n\n${LONE_IMAGE}`,
  "g"
)

// Obsidian's `![alt|300](img.png)` alone in its paragraph → Vanilla's
// #+ATTR_HTML: line above `![alt](img.png)`; code in it is masked
function sizesToVanilla(masked: string): Edit[] {
  const edits: Edit[] = []
  for (const { index, 0: image, 1: text = "", 2: url = "" } of masked.matchAll(
    SIZED_IMAGE_RE
  )) {
    const size = SIZE_SUFFIX_RE.exec(text)
    if (size && !image.includes("\0") && IMAGE_EXTENSION_RE.test(url)) {
      const [, alt, width, height] = size
      edits.push([
        index,
        index + image.trimEnd().length,
        `#+ATTR_HTML: ${attrHtmlValue(sizeOf(width, height))}\n\n![${alt}](${url})`
      ])
    }
  }
  return edits
}

// a size line and image, outside code, the line the last of a
// paragraph of keywords
function vanillaSized(
  text: string,
  url: string,
  above: string | undefined
): boolean {
  return (
    (!above || above.startsWith("#+")) &&
    !text.includes("\0") &&
    IMAGE_EXTENSION_RE.test(url)
  )
}

// Vanilla → Obsidian: the inverse, where Obsidian can spell the size and
// the line ends a paragraph of keywords
function fromVanilla(markdown: string): string {
  if (!markdown.includes("#+ATTR_HTML:")) {
    return markdown
  }
  const masked = maskCode(markdown)
  const edits: Edit[] = []
  for (const match of masked.matchAll(ATTR_HTML_IMAGE_RE)) {
    const { index, 0: text, 2: alt, 3: url = "" } = match
    const size = obsidianSize([match[1]])
    const above = masked.slice(0, index).split("\n").at(-2)
    if (size && vanillaSized(text, url, above)) {
      edits.push([
        index - (above ? 1 : 0),
        index + text.trimEnd().length,
        `${above ? "\n\n" : ""}![${alt}${sizeSuffix(size)}](${url})`
      ])
    }
  }
  return applyEdits(markdown, edits)
}

const COMMENT_RE = /%%([\s\S]*?)%%/g
const FOOTNOTE_LABEL_RE = /\[\^(\d+)\]/g

// Obsidian Markdown → Vanilla Markdown: a comment is an HTML comment,
// an inline footnote a footnote, numbered on from the page's own, its
// definition at the end; their delimiters count outside code only, what
// they hold may be code
function toVanilla(markdown: string): string {
  let masked = maskCode(markdown)
  let edits: Edit[] = []
  for (const { index, 0: comment } of masked.matchAll(COMMENT_RE)) {
    const end = index + comment.length
    // a `-->` in it would end it early; core reads `--&gt;` back
    const body = markdown.slice(index + 2, end - 2).replaceAll("-->", "--&gt;")
    edits.push([index, end, `<!--${body}-->`])
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
    // a comment in the note goes with it, into its definition
    const inside = ([at]: Edit): boolean => at > start && at < end
    const note = applyEdits(
      markdown.slice(start + 2, end),
      edits
        .filter(inside)
        .map(([from, to, text]) => [from - start - 2, to - start - 2, text])
    )
    edits = edits.filter(edit => !inside(edit))
    definitions.push(`[^${next}]: ${note}`)
    edits.push([start, end + 1, `[^${next++}]`])
  }
  edits.push(...sizesToVanilla(masked))
  const result = applyEdits(markdown, edits)
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
