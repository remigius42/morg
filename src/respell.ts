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

/** The Markdown options a translation honours (ADR 0007). */
export interface RespellOptions {
  interpretHtml?: Toggle
  spelling?: Spellings
  onWarning?: (message: string) => void
}

type Edit = [start: number, end: number, text: string]

const INLINE_TAGS: Record<string, HtmlConstruct> = {
  u: "underline",
  sup: "superscript",
  sub: "subscript"
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
    const tag = /^<(u|sup|sub)\s*>$/i
      .exec((child as { value?: string }).value ?? "")?.[1]
      ?.toLowerCase()
    return (
      child.type === "html" &&
      tag !== undefined &&
      htmlToMarkdown(options, INLINE_TAGS[tag] as HtmlConstruct)
    )
  })
}

// a block a conversion would write in another spelling than its own
function respelled(node: Node, options: RespellOptions): boolean {
  switch (node.type) {
    case "defList":
      return spellingOf(options.spelling, "definitionList") === "html"
    case "html":
      return (
        /^<dl[\s>]/i.test((node as { value?: string }).value ?? "") &&
        htmlToMarkdown(options, "definitionList")
      )
    case "paragraph":
      return holdsInlineHtml(node as Parent, options)
    default:
      return false
  }
}

// a block converted as a document of its own, in its container: what
// precedes its first line (a quote's `>`, a list item's indentation)
// prefixes the others
function convertBlock(
  markdown: string,
  start: number,
  end: number,
  options: RespellOptions
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
  ).replace(/\n$/, "")
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
 * as they are.
 * @param markdown The translated Markdown.
 * @param options The Markdown options.
 * @returns The Markdown in the spellings the options name.
 */
export function respellMarkdown(
  markdown: string,
  options: RespellOptions
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
  visit(tree, (node: Node) => {
    if (!respelled(node, own)) {
      return undefined
    }
    const start = node.position?.start.offset ?? 0
    // a definition list's end takes in the blank lines after it
    const end =
      start +
      markdown.slice(start, node.position?.end.offset ?? 0).trimEnd().length
    edits.push([start, end, convertBlock(markdown, start, end, own)])
    return SKIP
  })
  let result = markdown
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + text + result.slice(end)
  }
  return result
}
