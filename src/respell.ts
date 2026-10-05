import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import { remarkDefinitionList } from "remark-definition-list"
import type { Node, Parent } from "unist"
import { SKIP, visit } from "unist-util-visit"
import { convertMarkdownToOrg } from "./markdownToOrg.js"
import { convertOrgToMarkdown } from "./orgToMarkdown.js"
import {
  spellingOf,
  toggleEnabled,
  type HtmlConstruct,
  type Spellings,
  type Toggle
} from "./options.js"
import type { Preset } from "./presets/types.js"
import { attrHtmlSize } from "./core/sizedImages.js"
import { inlineHtmlOpenTag } from "./core/mdastToUniorg/phrasing.js"
import { applyEdits, type Edit } from "./core/edits.js"

/** The Markdown options a translation honours (ADR 0007). */
export interface RespellOptions {
  interpretHtml?: Toggle
  spelling?: Spellings
  onWarning?: (message: string) => void
}

// whether a construct's HTML reads as the construct and is written in
// Markdown's spelling: a conversion would change it
function htmlToMarkdown(options: RespellOptions, construct: HtmlConstruct) {
  return (
    toggleEnabled(options.interpretHtml, construct, false) &&
    spellingOf(options.spelling, construct) === "markdown"
  )
}

function holdsInlineHtml(node: Parent, options: RespellOptions): boolean {
  return node.children.some(child => {
    const tag = inlineHtmlOpenTag((child as { value?: string }).value ?? "")
    return (
      child.type === "html" &&
      tag !== undefined &&
      htmlToMarkdown(options, tag.construct)
    )
  })
}

// a block a conversion would write in another spelling than its own;
// HTML in a paragraph is no block
function respelled(
  node: Node,
  parent: Parent | undefined,
  options: RespellOptions
): boolean {
  switch (node.type) {
    case "defList":
      return spellingOf(options.spelling, "definitionList") === "html"
    case "html": {
      const value = (node as { value?: string }).value ?? ""
      return (
        parent?.type !== "paragraph" &&
        ((/^<dl[\s>]/i.test(value) &&
          htmlToMarkdown(options, "definitionList")) ||
          (/^<img\s/i.test(value) && htmlToMarkdown(options, "images")))
      )
    }
    case "paragraph":
      return holdsInlineHtml(node as Parent, options)
    default:
      return false
  }
}

// what a node starts and ends at in the source, without the blank
// lines a definition list's end takes in after it
function span(markdown: string, node: Node): [number, number] {
  const start = node.position?.start.offset ?? 0
  const end = node.position?.end.offset ?? 0
  return [start, start + markdown.slice(start, end).trimEnd().length]
}

const KEYWORD_LINE_RE = /^#\+\S+:/
const ATTR_HTML_RE = /^#\+ATTR_HTML:[ \t]+(.*)$/i

// the start of an #+ATTR_HTML: size line ending a paragraph of
// keywords, and whether keywords stay above it
function sizeLine(
  markdown: string,
  node: Node
): { start: number; below: boolean } | undefined {
  const [start, end] = span(markdown, node)
  const lines = markdown.slice(start, end).split("\n")
  const last = lines.at(-1) ?? ""
  const size = ATTR_HTML_RE.exec(last)?.[1]
  return node.type === "paragraph" &&
    lines.every(line => KEYWORD_LINE_RE.test(line)) &&
    size !== undefined &&
    attrHtmlSize(size)
    ? { start: end - last.length, below: lines.length > 1 }
    : undefined
}

// a paragraph that is one image
function loneImage(node: Node | undefined): boolean {
  const children = (node as Parent | undefined)?.children ?? []
  return (
    node?.type === "paragraph" &&
    children.length === 1 &&
    children[0]?.type === "image"
  )
}

// an #+ATTR_HTML: size line and the lone image below it, the size org
// reads (ADR 0007): where they start and end, and the line break that
// sets the keywords above apart
function sizedImage(
  markdown: string,
  node: Node,
  next: Node | undefined
): [number, number, string] | undefined {
  const line = loneImage(next) ? sizeLine(markdown, node) : undefined
  return line && next
    ? [line.start, span(markdown, next)[1], line.below ? "\n" : ""]
    : undefined
}

// a block converted as a document of its own, in its container: what
// precedes its first line (a quote's `>`, a list item's indentation)
// prefixes the others
function convertBlock(
  markdown: string,
  start: number,
  end: number,
  options: RespellOptions & { preset?: Preset }
): string {
  const lineStart = markdown.lastIndexOf("\n", start - 1) + 1
  const prefix = markdown
    .slice(lineStart, start)
    .replace(/(?:[-*+]|\d+[.)])(?=\s)/g, bullet => " ".repeat(bullet.length))
  const source = markdown
    .slice(start, end)
    .split("\n")
    .map((line, i) =>
      i && line.startsWith(prefix) ? line.slice(prefix.length) : line
    )
    .join("\n")
  const converted = convertOrgToMarkdown(
    convertMarkdownToOrg(source, options),
    options
  ).replace(/\n+$/, "")
  return converted
    .split("\n")
    .map((line, i) => (i ? (line ? prefix + line : prefix.trimEnd()) : line))
    .join("\n")
}

/**
 * Writes the constructs a translation's Markdown options concern in the
 * spelling they name (ADR 0007): a block holding one is converted on
 * its own, the rest of the document stays as written. Underline and
 * scripts in their Markdown spelling, org text only morg writes, stay
 * as they are; an image's `#+ATTR_HTML:` size line, whole lines above
 * it, is read as its size.
 * @param markdown Vanilla Markdown, between a translation's dialects.
 * @param options The Markdown options.
 * @param carried The dialect whose syntax the Vanilla Markdown carries,
 * which a block keeps; an image is Vanilla's, for the output's dialect
 * to translate.
 * @returns The Markdown in the spellings the options name.
 */
export function respellMarkdown(
  markdown: string,
  options: RespellOptions,
  carried?: Preset
): string {
  const { interpretHtml, spelling, onWarning } = options
  if (interpretHtml === undefined && spelling === undefined) {
    return markdown
  }
  // a translation's presets are not the block's: it is converted alone
  const own: RespellOptions = {
    ...(interpretHtml !== undefined && { interpretHtml }),
    ...(spelling !== undefined && { spelling }),
    ...(onWarning && { onWarning })
  }
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .use(remarkDefinitionList)
    .parse(markdown)
  const edits: Edit[] = []
  visit(tree, (node: Node, index, parent: Parent | undefined) => {
    const sized =
      spellingOf(own.spelling, "images") === "html" &&
      sizedImage(markdown, node, parent?.children[(index ?? 0) + 1])
    if (sized) {
      const [start, end, gap] = sized
      const img = convertBlock(markdown, start, end, own)
      edits.push([start, end, `${gap}${img}`])
      return SKIP
    }
    if (!respelled(node, parent, own)) {
      return undefined
    }
    const [start, end] = span(markdown, node)
    const image = node.type === "html"
    edits.push([
      start,
      end,
      convertBlock(markdown, start, end, {
        ...own,
        ...(carried && !image && { preset: carried })
      })
    ])
    return SKIP
  })
  return applyEdits(markdown, edits)
}
