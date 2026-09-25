import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { uniorgStringify } from "uniorg-stringify"

// how the escape passes see a node's inline content: as the org text it
// renders to, since what org reads depends on neighboring nodes

export type Node = Parent["children"][number] & { value?: string }

// built once: constructing a processor per parse dominates the cost
export const orgParser = unified().use(uniorgParse).freeze()
export const positionParser = unified()
  .use(uniorgParse, { trackPosition: true })
  .freeze()
const stringifier = unified().use(uniorgStringify).freeze()

/**
 * Parses `text` as an org document, or returns undefined where uniorg
 * throws: it takes a line starting `_.` or `_)` for a bullet, then
 * fails to read it (org has no such bullet; see underscoreBullets).
 */
export function tryParse(
  text: string,
  parser: { parse(text: string): unknown } = orgParser
): Parent | undefined {
  try {
    return parser.parse(text) as Parent
  } catch {
    return undefined
  }
}

// uniorg's inline node types; anything else is a block element (in a
// list item's flattened content: a nested list or code block)
const INLINE_TYPES = new Set([
  "text",
  "bold",
  "italic",
  "underline",
  "strike-through",
  "code",
  "verbatim",
  "link",
  "footnote-reference",
  "latex-fragment",
  "entity",
  "timestamp",
  "subscript",
  "superscript",
  "export-snippet",
  "statistics-cookie",
  "citation",
  "line-break"
])

export function isInline(node: Node | Parent): boolean {
  return INLINE_TYPES.has(node.type)
}

// ends the rendering, so the paragraph's own trailing newline and
// whitespace trimming stay out of it
const SENTINEL = "\u0000"

/**
 * How org renders an inline node within its line.
 */
export function renderInline(node: Node): string {
  if (node.type === "text") {
    return node.value ?? ""
  }
  const rendered = String(
    stringifier.stringify({
      type: "org-data",
      children: [
        {
          type: "paragraph",
          children: [node, { type: "text", value: SENTINEL }]
        }
      ]
    } as Parameters<typeof stringifier.stringify>[0])
  )
  return rendered.slice(0, rendered.lastIndexOf(SENTINEL))
}

// stands in for an inline node's content
const CONTENT = "\u0001"

/**
 * An inline node's delimiters around its children, as org renders them
 * (`*` and `*`, `[[url][` and `]]`).
 */
export function delimiters(node: Node): [string, string] {
  const [open = "", close = ""] = renderInline({
    ...node,
    children: [{ type: "text", value: CONTENT }]
  } as Node).split(CONTENT)
  return [open, close]
}

/**
 * The org rendering of each child; a block element only ends a line.
 */
export function renderChildren(children: Node[]): string[] {
  return children.map(child => (isInline(child) ? renderInline(child) : "\n"))
}

/**
 * The index of the rendered child `offset` (into the joined rendering)
 * lies in, and the offset within that child.
 */
export function locate(rendered: string[], offset: number): [number, number] {
  let start = 0
  for (const [index, part] of rendered.entries()) {
    if (offset < start + part.length) {
      return [index, offset - start]
    }
    start += part.length
  }
  return [-1, 0]
}
