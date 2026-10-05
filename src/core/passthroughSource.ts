import type { ListItem, Paragraph, Root, RootContent } from "mdast"
import { visit } from "unist-util-visit"
import { KEYWORD_NAME } from "./frontmatterBlock.js"
import { keyValueEntries } from "./keyValueLines.js"
import { readsAsPassthrough } from "./lineSyntax.js"

// the first line of an org block or drawer
const BLOCK_START_RE = /^#\+begin_(\S+)/i
const DRAWER_START_RE = /^:[\w-]+:$/

/** Whether a line opens an org block (`#+begin_name`). */
export function isOrgBlockStart(line: string): boolean {
  return BLOCK_START_RE.test(line)
}

/** Whether a line opens an org drawer (`:NAME:`). */
export function isDrawerStart(line: string): boolean {
  return DRAWER_START_RE.test(line)
}

/**
 * The line that ends the org block or drawer a line opens.
 * @param lines The lines.
 * @param start The index of the opening line.
 * @returns The index of the `#+end_name` or `:END:` line, or -1.
 */
export function orgElementEnd(lines: string[], start: number): number {
  const end = endPattern(lines[start] ?? "")
  return end ? lines.findIndex((other, i) => i > start && end.test(other)) : -1
}

// the pattern of the line that ends the block or drawer `line` opens
function endPattern(line: string): RegExp | null {
  const block = BLOCK_START_RE.exec(line)?.[1]
  if (block) {
    return new RegExp(`^#\\+end_${block.replace(/\W/g, "\\$&")}\\s*$`, "i")
  }
  return DRAWER_START_RE.test(line) ? /^:end:\s*$/i : null
}

// the text from `offset` through the line that ends the block or
// drawer opening there, read line by line rather than splitting the
// rest of the document (a page may hold thousands of drawers)
function elementSource(markdown: string, offset: number): string | null {
  const lineEnd = (from: number): number => {
    const index = markdown.indexOf("\n", from)
    return index === -1 ? markdown.length : index
  }
  let end = lineEnd(offset)
  const pattern = endPattern(markdown.slice(offset, end))
  while (pattern && end < markdown.length) {
    const next = lineEnd(end + 1)
    if (pattern.test(markdown.slice(end + 1, next))) {
      return markdown.slice(offset, next)
    }
    end = next
  }
  return null
}

// a fixed-width line as org→md writes it, its `:` escaped (ADR 0007);
// unescaped, a `: ` line is Markdown text
const FIXED_WIDTH_RE = /^[ \t]*\\:(?=[ \t]|$)/

/** A `#+KEY: value` line, which org→md writes as it is. */
export const KEYWORD_LINE_RE = new RegExp(String.raw`^#\+${KEYWORD_NAME}: `)

// the run of lines from `offset` on that `pattern` matches, up to the
// last one's end, without its line break
function lineRun(
  markdown: string,
  offset: number,
  pattern: RegExp
): { length: number; lines: string[] } | null {
  const lines: string[] = []
  let end = offset
  while (end < markdown.length) {
    const next = markdown.indexOf("\n", end)
    const line = markdown.slice(end, next === -1 ? markdown.length : next)
    if (!pattern.test(line)) {
      break
    }
    lines.push(line)
    end = next === -1 ? markdown.length : next + 1
  }
  if (!lines.length) {
    return null
  }
  return {
    length: end - offset - (end > offset && markdown[end - 1] === "\n" ? 1 : 0),
    lines
  }
}

// the run of fixed-width lines from `offset` on, their escapes dropped:
// read as Markdown, inline math spanning lines would keep a `\`
function fixedWidthSource(
  markdown: string,
  offset: number
): { length: number; org: string } | null {
  const run = lineRun(markdown, offset, FIXED_WIDTH_RE)
  return (
    run && {
      length: run.length,
      org: run.lines.map(line => line.replace("\\:", ":")).join("\n")
    }
  )
}

// the fixed-width lines, or the block or drawer, from `offset` on
function elementAt(
  markdown: string,
  offset: number
): { length: number; org: string } | null {
  const fixed = fixedWidthSource(markdown, offset)
  if (fixed) {
    return fixed
  }
  const org = elementSource(markdown, offset)
  return org === null ? null : { length: org.length, org }
}

// where the passthrough element starting at a node ends in the source,
// and its org text, or null
function passthroughSource(
  node: RootContent,
  markdown: string
): { end: number; org: string } | null {
  const start = node.position?.start
  if (start?.column !== 1 || start.offset === undefined) {
    return null
  }
  // affiliated keywords may lead the element (`#+RESULTS:`)
  const keywords = lineRun(markdown, start.offset, KEYWORD_LINE_RE)
  const lead = keywords ? `${keywords.lines.join("\n")}\n` : ""
  const offset = start.offset + (keywords ? keywords.length + 1 : 0)
  const element = elementAt(markdown, offset)
  if (element && readsAsPassthrough(lead + element.org)) {
    return { end: offset + element.length, org: lead + element.org }
  }
  // keywords, not one passthrough element: each line is one
  return keywords
    ? { end: start.offset + keywords.length, org: keywords.lines.join("\n") }
    : null
}

// a paragraph of `key:: value` lines below a heading, as org→md writes
// a headline's properties: their values are org text
function propertySource(
  node: RootContent,
  markdown: string
): { end: number; org: string } | null {
  const { start, end } = node.position ?? {}
  if (
    node.type !== "paragraph" ||
    start?.offset === undefined ||
    end?.offset === undefined
  ) {
    return null
  }
  const org = markdown.slice(start.offset, end.offset)
  return keyValueEntries(org) ? { end: end.offset, org } : null
}

// the index of the last node ending at `end`, from `i` on, or -1
function lastNodeAt(nodes: RootContent[], i: number, end: number): number {
  let j = i
  while ((nodes[j]?.position?.end.offset ?? end) < end) {
    j++
  }
  return nodes[j]?.position?.end.offset === end ? j : -1
}

/**
 * md→org: a passthrough element's org text may hold lines Markdown reads
 * as syntax of its own (a blank line and an indented one, a `#`, `-`
 * or `>` line); the top-level nodes it parsed into become one paragraph
 * of the source text again, which goes back to org as it is.
 * @param mdast The parsed Markdown.
 * @param markdown Its source.
 */
export function keepPassthroughSource(mdast: Root, markdown: string): void {
  const children: RootContent[] = []
  const nodes = mdast.children
  // below a heading, or below such a paragraph
  let belowHeading = false
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as RootContent
    const property: { end: number; org: string } | null = belowHeading
      ? propertySource(node, markdown)
      : null
    const source = property ?? passthroughSource(node, markdown)
    belowHeading = node.type === "heading" || property !== null
    const last = source ? lastNodeAt(nodes, i, source.end) : -1
    if (!source || last === -1) {
      children.push(node)
      continue
    }
    children.push({
      type: "paragraph",
      children: [{ type: "text", value: source.org }]
    })
    i = last
  }
  mdast.children = children
}

// the org text of a list item's paragraph that holds only fixed-width
// and keyword lines, as org→md writes an element there, or null
function itemPassthroughSource(
  node: Paragraph,
  markdown: string
): string | null {
  const { start, end } = node.position ?? {}
  if (start?.offset === undefined || end?.offset === undefined) {
    return null
  }
  // through the line's end: Markdown leaves trailing blanks out
  const lineEnd = markdown.indexOf("\n", end.offset)
  const lines = markdown
    .slice(start.offset, lineEnd === -1 ? markdown.length : lineEnd)
    .split("\n")
    .map(line => line.trimStart())
  const verbatim = lines.every(
    line => FIXED_WIDTH_RE.test(line) || KEYWORD_LINE_RE.test(line)
  )
  if (!verbatim) {
    return null
  }
  const org = lines.map(line => line.replace(/^\\:/, ":")).join("\n")
  return lines.every(line => KEYWORD_LINE_RE.test(line)) ||
    readsAsPassthrough(org)
    ? org
    : null
}

/**
 * md→org: a list item's paragraph of fixed-width or keyword lines, set
 * apart as org→md writes them, becomes their org text again; the item's
 * first paragraph follows the bullet, where org reads none.
 * @param mdast The parsed Markdown.
 * @param markdown Its source.
 */
export function keepItemPassthroughSource(mdast: Root, markdown: string): void {
  visit(mdast, "listItem", (item: ListItem) => {
    for (const [i, child] of item.children.entries()) {
      const org =
        i > 0 && child.type === "paragraph"
          ? itemPassthroughSource(child, markdown)
          : null
      if (org !== null) {
        ;(child as Paragraph).children = [{ type: "text", value: org }]
      }
    }
  })
}
