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
  const line = lines[start] ?? ""
  const block = BLOCK_START_RE.exec(line)?.[1]
  const end = block
    ? new RegExp(`^#\\+end_${block.replace(/\W/g, "\\$&")}\\s*$`, "i")
    : DRAWER_START_RE.test(line)
      ? /^:end:\s*$/i
      : null
  return end ? lines.findIndex((other, i) => i > start && end.test(other)) : -1
}

// the source offset where the passthrough element starting at a node
// ends, or -1
function passthroughEnd(node: RootContent, markdown: string): number {
  const start = node.position?.start
  if (start?.column !== 1 || start.offset === undefined) {
    return -1
  }
  const lineEnd = markdown.indexOf("\n", start.offset)
  const first = markdown.slice(
    start.offset,
    lineEnd === -1 ? undefined : lineEnd
  )
  if (!isOrgBlockStart(first) && !isDrawerStart(first)) {
    return -1
  }
  const lines = markdown.slice(start.offset).split("\n")
  const last = orgElementEnd(lines, 0)
  const source = lines.slice(0, last + 1).join("\n")
  return last !== -1 && readsAsPassthrough(source)
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
