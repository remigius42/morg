import type { Root, RootContent } from "mdast"
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

// the source offset where the passthrough element starting at a node
// ends, or -1
function passthroughEnd(node: RootContent, markdown: string): number {
  const start = node.position?.start
  if (start?.column !== 1 || start.offset === undefined) {
    return -1
  }
  const source = elementSource(markdown, start.offset)
  return source !== null && readsAsPassthrough(source)
    ? start.offset + source.length
    : -1
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
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as RootContent
    const end = passthroughEnd(node, markdown)
    const last = end === -1 ? -1 : lastNodeAt(nodes, i, end)
    if (last === -1) {
      children.push(node)
      continue
    }
    const value = markdown.slice(node.position?.start.offset, end)
    children.push({ type: "paragraph", children: [{ type: "text", value }] })
    i = last
  }
  mdast.children = children
}
