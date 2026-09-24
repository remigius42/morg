import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { uniorgStringify } from "uniorg-stringify"

// how the escape passes see a node's inline content: as the org text it
// renders to, since what org reads depends on neighboring nodes

export type Node = Parent["children"][number] & { value?: string }

// built once: constructing a processor per parse dominates the cost
export const orgParser = unified().use(uniorgParse).freeze()
const stringifier = unified().use(uniorgStringify).freeze()

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

// how org renders an inline node within its line
function renderInline(node: Node): string {
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
