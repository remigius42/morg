import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { visit } from "unist-util-visit"
// a line starting with a zero-width space is no org line syntax (list
// item, headline, comment, keyword, table, ...), but renders as text
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"

type Node = Parent["children"][number] & { value?: string }

const orgParser = unified().use(uniorgParse).freeze()

// org line syntax starts with punctuation (`- `, `* `, `# `, `| `, `:`,
// `[fn:`, `\begin`) or with a word followed by `.`, `)` or `:` (`1.`,
// `a)`, `CLOCK:`); any other line is text, and skips the parse
const MAY_BE_LINE_SYNTAX_RE = /^(?![\p{L}\p{N}])|^[\p{L}\p{N}]+[.):]/u

// whether org reads `line` as anything but a plain paragraph
function readsAsLineSyntax(line: string): boolean {
  if (!MAY_BE_LINE_SYNTAX_RE.test(line)) {
    return false
  }
  const [first, ...rest] = orgParser.parse(line).children
  return first?.type !== "paragraph" || rest.length > 0
}

// inline nodes a list item's flattened content may hold; anything else
// is a block element (nested list, code block), ending its line
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

// whether the node at `index` starts on a fresh line; the first child
// of a list item (or of its first paragraph) follows the bullet instead
function startsLine(
  children: Node[],
  index: number,
  afterBullet: boolean
): boolean {
  const previous = children[index - 1]
  if (!previous) {
    return !afterBullet
  }
  if (previous.type === "line-break" || !INLINE_TYPES.has(previous.type)) {
    return true
  }
  return previous.type === "text" && Boolean(previous.value?.endsWith("\n"))
}

// offsets in the node's value that start a line
function lineStarts(
  children: Node[],
  index: number,
  afterBullet: boolean
): number[] {
  const value = children[index]?.value ?? ""
  const starts = startsLine(children, index, afterBullet) ? [0] : []
  for (let i = value.indexOf("\n"); i !== -1; i = value.indexOf("\n", i + 1)) {
    starts.push(i + 1)
  }
  // org keeps a continuation line's indentation in the text
  return starts
    .map(start => start + (/^[ \t]*/.exec(value.slice(start))?.[0].length ?? 0))
    .filter(start => start < value.length)
}

// calls `rewrite` on every text node of a paragraph, or of a list item,
// whose inline content md→org flattens, with the offsets starting a line
function rewriteLines(
  tree: Parent,
  rewrite: (value: string, starts: number[]) => string
): void {
  visit(tree, (node: Node | Parent, index, parent: Parent | undefined) => {
    if (node.type !== "paragraph" && node.type !== "list-item") {
      return
    }
    const afterBullet =
      node.type === "list-item" || (parent?.type === "list-item" && index === 0)
    const children = (node as Parent).children as Node[]
    for (const [i, child] of children.entries()) {
      if (child.type === "text" && child.value) {
        child.value = rewrite(child.value, lineStarts(children, i, afterBullet))
      }
    }
  })
}

/**
 * md→org: a paragraph line org would read as line syntax (an escaped
 * `1\.` or `\*`, or a lazy continuation line) gets a leading zero-width
 * space, or it would turn into a list item, headline, comment or table.
 */
export function escapeLineSyntax(tree: Parent): void {
  rewriteLines(tree, (value, starts) =>
    // back to front, so earlier offsets stay valid
    starts.reverse().reduce((escaped, start) => {
      const end = value.indexOf("\n", start)
      const line = value.slice(start, end === -1 ? undefined : end)
      return readsAsLineSyntax(line)
        ? escaped.slice(0, start) + ZERO_WIDTH_SPACE + escaped.slice(start)
        : escaped
    }, value)
  )
}

/**
 * org→md: drops the line-start zero-width spaces `escapeLineSyntax`
 * inserts.
 */
export function unescapeLineSyntax(tree: Parent): void {
  rewriteLines(tree, (value, starts) => {
    const lineStart = new Set(starts)
    return value
      .split("")
      .filter((char, i) => !(char === ZERO_WIDTH_SPACE && lineStart.has(i)))
      .join("")
  })
}
