import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import type {
  Definition,
  FootnoteDefinition,
  Heading,
  ImageReference,
  LinkReference,
  List,
  ListItem,
  RootContent
} from "mdast"
import type { Node } from "unist"
import { visit } from "unist-util-visit"
import type { Block, Meta, Outline } from "./logseqOutline.js"
import type { ConversionContext } from "./types.js"

// Vanilla Markdown read as Logseq's outline (ADR 0006), as Logseq reads
// a file it did not write: a list item is a block, its nested list its
// children.

function parse(markdown: string) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .parse(markdown)
}

// a node's source lines, 0-based start and end line
function span(node: RootContent): [number, number] {
  return [
    (node.position?.start.line ?? 1) - 1,
    (node.position?.end.line ?? 1) - 1
  ]
}

// a bullet up to its content's column: one to four spaces after it, or
// one where more start indented code
const BULLET_RE = /^\s*(?:[-*+]|\d+[.)])(?: {1,4}(?=\S)| |$)/
const CHECKBOX_RE = /^\[([ xX])\](?: |$)/
// the markers Logseq shows unchecked other than TODO, which a task item
// writes after its checkbox
const UNCHECKED_MARKER_RE = /^(?:NOW|LATER|DOING|IN-PROGRESS|WAIT|WAITING) /
const PROPERTY_RE = /^([\w.-]+)::(?: (.*))?$/
const HEADING_RE = /^(#{1,6})(?: (.*))?$/

// a task item's checkbox as Logseq's task marker
function taskTitle(item: ListItem, title: string): string {
  const checkbox = CHECKBOX_RE.exec(title)
  if (item.checked === null || item.checked === undefined || !checkbox) {
    return title
  }
  const text = title.slice(checkbox[0].length)
  if (item.checked) {
    return `DONE ${text}`
  }
  return UNCHECKED_MARKER_RE.test(text) ? text : `TODO ${text}`
}

// key:: lines: planning under its org-ism names (orgismKeys maps them),
// one planning line where the first of them was, and properties
function readMeta(lines: string[], context: ConversionContext): Meta[] {
  const canonical = new Map(
    Object.entries(context.orgismKeys ?? {}).map(([key, custom]) => [
      custom,
      key
    ])
  )
  const meta: Meta[] = []
  let planning: { lines: string[] } | undefined
  for (const line of lines) {
    const [, rawKey = "", value = ""] = PROPERTY_RE.exec(line) ?? []
    const key = canonical.get(rawKey) ?? rawKey
    if (key !== "scheduled" && key !== "deadline") {
      meta.push({ key: rawKey, value })
      continue
    }
    const entry = `${key.toUpperCase()}: ${value}`
    if (planning) {
      planning.lines[0] += ` ${entry}`
    } else {
      planning = { lines: [entry] }
      meta.push(planning)
    }
  }
  return meta
}

// a lazy continuation line sits anywhere left of the column; a tab
// reaches the next tab stop (4), the part of it right of the column
// stays as spaces
export function dedent(line: string, column: number): string {
  let width = 0
  let i = 0
  while (width < column && (line[i] === " " || line[i] === "\t")) {
    width = columns(line[i++] ?? "", width)
  }
  return " ".repeat(Math.max(0, width - column)) + line.slice(i)
}

// the column text ends at, from a start column, a tab reaching the next
// tab stop
export function columns(text: string, start = 0): number {
  let width = start
  for (const char of text) {
    width += char === "\t" ? 4 - (width % 4) : 1
  }
  return width
}

// the column a list item's content starts at
function contentColumn(line: string): number {
  return columns(BULLET_RE.exec(line)?.[0] ?? "")
}

function leadingProperties(lines: string[]): number {
  const count = lines.findIndex(line => !PROPERTY_RE.test(line))
  return count === -1 ? lines.length : count
}

interface Reader {
  lines: string[]
  blocks: Block[]
  context: ConversionContext
}

// an item's own lines, up to its nested list: the bullet off its first,
// its checkbox read, continuation lines moved left past the bullet
function itemSource(item: ListItem, end: number, lines: string[]): string[] {
  const [first = "", ...rest] = lines.slice(span(item)[0], end + 1)
  const column = contentColumn(first)
  return [
    taskTitle(item, first.slice(BULLET_RE.exec(first)?.[0].length ?? 0)),
    ...rest.map(line => dedent(line, column))
  ]
}

// a title as a heading's level and text
function readHeading(title: string): [number, string] {
  const match = HEADING_RE.exec(title)
  return match ? [match[1]?.length ?? 0, match[2] ?? ""] : [0, title]
}

// key:: lines below the title, or opening the content, are its meta
function itemBlock(source: string[], level: number, reader: Reader): Block {
  const metaFirst = PROPERTY_RE.test(source[0] ?? "")
  const body = metaFirst ? source : source.slice(1)
  const count = leadingProperties(body)
  const meta = readMeta(body.slice(0, count), reader.context)
  if (metaFirst) {
    return { level, heading: 0, metaFirst, meta, content: body.slice(count) }
  }
  const [heading, title] = readHeading(source[0] ?? "")
  return {
    level,
    heading,
    metaFirst,
    meta,
    content: [title, ...body.slice(count)]
  }
}

function readItem(
  item: ListItem,
  level: number,
  ordered: boolean,
  reader: Reader
): void {
  // a list on the item's first line is its content, not its children
  const nested = item.children.filter(
    (child): child is List =>
      child.type === "list" && span(child)[0] > span(item)[0]
  )
  const end = nested[0] ? span(nested[0])[0] - 1 : span(item)[1]
  const block = itemBlock(itemSource(item, end, reader.lines), level, reader)
  if (ordered) {
    block.meta.push({ key: "logseq.order-list-type", value: "number" })
  }
  reader.blocks.push(block)
  // what follows the first nested list: more lists, and text, which a
  // block's content cannot hold after its children, as child blocks
  const column = contentColumn(reader.lines[span(item)[0]] ?? "")
  const rest = nested[0]
    ? item.children.slice(item.children.indexOf(nested[0]))
    : []
  for (const child of rest) {
    if (child.type === "list") {
      readList(child, level + 1, reader)
      continue
    }
    const [start, end] = span(child)
    reader.blocks.push({
      level: level + 1,
      heading: 0,
      metaFirst: false,
      meta: [],
      content: reader.lines
        .slice(start, end + 1)
        .map(line => dedent(line, column))
    })
  }
}

function readList(list: List, level: number, reader: Reader): void {
  for (const item of list.children) {
    readItem(item, level, Boolean(list.ordered), reader)
  }
}

// the enclosing headings: their depth and their block's level
type Headings = { depth: number; level: number }[]

function headingBlock(
  node: Heading,
  headings: Headings,
  lines: string[]
): Block {
  while ((headings.at(-1)?.depth ?? 0) >= node.depth) {
    headings.pop()
  }
  const level = (headings.at(-1)?.level ?? 0) + 1
  headings.push({ depth: node.depth, level })
  return {
    level,
    heading: node.depth,
    metaFirst: false,
    meta: [],
    content: [headingTitle(lines[span(node)[0]] ?? "")]
  }
}

// a link destination as Markdown writes it inline
function destination(url: string): string {
  return /[\s()<>]/.test(url) ? `<${url}>` : url
}

type Edit = [start: number, end: number, text: string]

function offsets(node: Node): [number, number] {
  return [node.position?.start.offset ?? 0, node.position?.end.offset ?? 0]
}

// what spans a page cannot travel in a block: a reference link becomes
// inline, a definition goes, and so does a footnote's definition, kept
// for the block of its first reference (ADR 0006)
function resolveReferences(markdown: string): {
  markdown: string
  footnotes: Map<string, string>
} {
  // links first: a footnote's definition may hold one
  const inline = inlineReferences(markdown)
  const footnotes = new Map<string, string>()
  const edits: Edit[] = []
  visit(parse(inline), "footnoteDefinition", (node: FootnoteDefinition) => {
    const [start, end] = offsets(node)
    footnotes.set(node.label ?? "", inline.slice(start, end))
    edits.push([start, end, ""])
  })
  return { markdown: applyEdits(inline, edits), footnotes }
}

function inlineReferences(markdown: string): string {
  const tree = parse(markdown)
  const definitions = new Map<string, Definition>()
  visit(tree, "definition", (node: Definition) => {
    definitions.set(node.identifier, node)
  })
  const edits: Edit[] = []
  visit(tree, (node: Node) => {
    const [start, end] = offsets(node)
    if (node.type === "definition") {
      edits.push([start, end, ""])
    } else if (
      node.type === "linkReference" ||
      node.type === "imageReference"
    ) {
      const reference = node as LinkReference | ImageReference
      const definition = definitions.get(reference.identifier)
      if (definition) {
        edits.push([start, end, inlineLink(reference, definition, markdown)])
      }
    }
  })
  return applyEdits(markdown, edits)
}

// edits of nodes that do not nest, last first so offsets hold
function applyEdits(text: string, edits: Edit[]): string {
  let result = text
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + replacement + result.slice(end)
  }
  return result
}

function inlineLink(
  reference: LinkReference | ImageReference,
  definition: Definition,
  markdown: string
): string {
  const title = definition.title ? ` "${definition.title}"` : ""
  const target = `(${destination(definition.url)}${title})`
  if (reference.type === "imageReference") {
    return `![${reference.alt ?? ""}]${target}`
  }
  const first = reference.children[0]
  const last = reference.children.at(-1)
  const text =
    first && last ? markdown.slice(offsets(first)[0], offsets(last)[1]) : ""
  return `[${text}]${target}`
}

// a footnote's definition, after the first block that refers to it
function placeFootnotes(blocks: Block[], footnotes: Map<string, string>) {
  for (const [label, definition] of footnotes) {
    const block = blocks.find(candidate =>
      candidate.content.some(line => line.includes(`[^${label}]`))
    )
    block?.content.push("", ...definition.split("\n").map(line => line.trim()))
  }
}

/**
 * Reads a Vanilla Markdown page into Logseq's outline.
 * @param markdown The Markdown page.
 * @param context The conversion's org-ism key names.
 * @returns The outline, its blocks' content in Markdown.
 */
export function readVanillaMarkdownOutline(
  markdown: string,
  context: ConversionContext
): Outline {
  const resolved = resolveReferences(markdown)
  markdown = resolved.markdown
  const reader: Reader = {
    lines: markdown.split(/\r?\n/),
    blocks: [],
    context
  }
  const headings: Headings = []
  // a heading whose body is still running: what follows it, up to a
  // list or the next heading, is its content
  let body: Block | undefined
  const page: string[] = []
  for (const node of parse(markdown).children) {
    const level = (headings.at(-1)?.level ?? 0) + 1
    if (node.type === "yaml") {
      const [start, end] = span(node)
      page.push(...reader.lines.slice(start, end + 1))
    } else if (node.type === "heading") {
      body = headingBlock(node, headings, reader.lines)
      reader.blocks.push(body)
    } else if (node.type === "list") {
      body = undefined
      readList(node, level, reader)
    } else {
      readText(node, level, body, reader)
    }
  }
  placeFootnotes(reader.blocks, resolved.footnotes)
  return { page, blocks: reader.blocks }
}

// text below a heading is its body; after a list, a block of its own
function readText(
  node: RootContent,
  level: number,
  body: Block | undefined,
  reader: Reader
): void {
  const [start, end] = span(node)
  // a rule's source may be bulleted (`- ---`), a list in a block
  // read from its own column, as an item's content is
  const column = columns(
    reader.lines[start]?.slice(0, (node.position?.start.column ?? 1) - 1) ?? ""
  )
  const source =
    node.type === "thematicBreak"
      ? ["---"]
      : reader.lines.slice(start, end + 1).map(line => dedent(line, column))
  if (body) {
    // the body's paragraphs keep the blank lines between them
    body.content.push(...(body.content.length > 1 ? [""] : []), ...source)
    return
  }
  reader.blocks.push({
    level,
    heading: 0,
    metaFirst: false,
    meta: [],
    content: source
  })
}

// an ATX heading's text, without its markers
function headingTitle(line: string): string {
  return line.replace(/^ {0,3}#{1,6}(?:\s+|$)/, "").replace(/\s+#+\s*$/, "")
}
