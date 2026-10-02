import type { Root, RootContent } from "mdast"
import { PASSTHROUGH_TYPES } from "./lineSyntax.js"
import { tryParse } from "./render.js"

// the first line of an org element spanning lines that org→md writes as
// its org text (verbatim passthrough, see mappings.md)
const BLOCK_START_RE = /^#\+begin_(\S+)/i
const DRAWER_START_RE = /^:[\w-]+:$/

// the pattern of the line that ends the element `line` starts, if any
function endPattern(line: string): RegExp | null {
  const block = BLOCK_START_RE.exec(line)?.[1]
  if (block) {
    return new RegExp(`^#\\+end_${block.replace(/\W/g, "\\$&")}\\s*$`, "i")
  }
  return DRAWER_START_RE.test(line) ? /^:end:\s*$/i : null
}

function isPassthrough(source: string): boolean {
  const [element, ...more] = tryParse(`${source}\n`)?.children ?? []
  return !more.length && PASSTHROUGH_TYPES.has(element?.type ?? "")
}

// the source offset where the passthrough element starting at a node
// ends, or -1
function passthroughEnd(node: RootContent, markdown: string): number {
  const start = node.position?.start
  if (start?.column !== 1 || start.offset === undefined) {
    return -1
  }
  const lineEnd = markdown.indexOf("\n", start.offset)
  const end = endPattern(
    markdown.slice(start.offset, lineEnd === -1 ? undefined : lineEnd)
  )
  if (!end) {
    return -1
  }
  const lines = markdown.slice(start.offset).split("\n")
  const last = lines.findIndex((line, i) => i > 0 && end.test(line))
  const source = lines.slice(0, last + 1).join("\n")
  return last !== -1 && isPassthrough(source)
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
