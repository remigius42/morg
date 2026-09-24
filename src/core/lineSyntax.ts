import type { Parent } from "unist"
import { visit } from "unist-util-visit"
// a line starting with a zero-width space is no org line syntax (list
// item, headline, comment, keyword, table, ...), but renders as text
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"
import {
  delimiters,
  isInline,
  locate,
  orgParser,
  renderInline,
  type Node
} from "./render.js"

// org line syntax starts with one of a few punctuation chars (`- `,
// `+ `, `* `, `# `, `| `, `:`, `[fn:`, `\begin`, `%%(`) or with a word
// followed by `.`, `)` or `:` (`1.`, `a)`, `CLOCK:`); any other line
// (one starting with a link or code, say) is text, and skips the parse
const MAY_BE_LINE_SYNTAX_RE = /^[-+*#|:[\\%]|^[\p{L}\p{N}]+[.):]/u

// whether org reads `line` as anything but a plain paragraph
function readsAsLineSyntax(line: string): boolean {
  if (!MAY_BE_LINE_SYNTAX_RE.test(line)) {
    return false
  }
  const [first, ...rest] = orgParser.parse(line).children
  return first?.type !== "paragraph" || rest.length > 0
}

// a piece of rendered inline content: a text node's value, another
// inline node, or an opening or closing delimiter of one with children;
// `siblings[index]` is the (enclosing) node, before which a line-start
// escape goes if it is no text
interface Segment {
  text: string
  node: Node
  siblings: Node[]
  index: number
  opens: boolean
}

// the rendered segments of inline content, descending into markup and
// link descriptions, since a line may start inside them (`*a\n# b*`)
function segments(children: Node[]): Segment[] {
  return children.flatMap((node, index): Segment[] => {
    const at = { node, siblings: children, index }
    if (!isInline(node)) {
      // a block element (nested list, code block) only ends a line
      return [{ ...at, text: "\n", opens: false }]
    }
    const inner = "children" in node ? (node.children as Node[]) : []
    if (!inner.length) {
      return [{ ...at, text: renderInline(node), opens: true }]
    }
    const [open, close] = delimiters(node)
    return [
      { ...at, text: open, opens: true },
      ...segments(inner),
      { ...at, text: close, opens: false }
    ]
  })
}

interface LineStart {
  // the segment the line starts in, and the offset in it
  segment: Segment
  offset: number
  line: string
}

// the lines of a paragraph's, or of a list item's flattened, inline
// content as org renders it, not per text node: a line may start with
// another node (`[fn:1] a`) or its syntax span nodes (`* ~x~`). The
// first line of a list item (or of its first paragraph), or of a
// footnote definition's first paragraph, follows the bullet or label
// instead
function lineStarts(children: Node[], afterBullet: boolean): LineStart[] {
  const parts = segments(children)
  const rendered = parts.map(part => part.text)
  const content = rendered.join("")
  const breaks = afterBullet ? [] : [0]
  for (
    let i = content.indexOf("\n");
    i !== -1;
    i = content.indexOf("\n", i + 1)
  ) {
    breaks.push(i + 1)
  }
  return breaks.flatMap(lineBreak => {
    // org keeps a continuation line's indentation in the text
    const [, indent = "", line = ""] =
      /^([ \t]*)(.*)/.exec(content.slice(lineBreak)) ?? []
    const [index, offset] = locate(rendered, lineBreak + indent.length)
    const segment = parts[index]
    return line && segment ? [{ segment, offset, line }] : []
  })
}

// calls `rewrite` on every paragraph, and every list item whose inline
// content md→org flattens, with its line starts;
// `applies` skips the rendering where there is nothing to rewrite
function rewriteLines(
  tree: Parent,
  rewrite: (starts: LineStart[]) => void,
  applies: (children: Node[]) => boolean = () => true
): void {
  visit(tree, (node: Node | Parent, index, parent: Parent | undefined) => {
    if (node.type !== "paragraph" && node.type !== "list-item") {
      return
    }
    const afterBullet =
      node.type === "list-item" ||
      (index === 0 &&
        (parent?.type === "list-item" ||
          parent?.type === "footnote-definition"))
    const children = (node as Parent).children as Node[]
    if (applies(children)) {
      rewrite(lineStarts(children, afterBullet))
    }
  })
}

/**
 * md→org: a paragraph line org would read as line syntax (an escaped
 * `1\.` or `\*`, or a lazy continuation line) gets a leading zero-width
 * space, or it would turn into a list item, headline, comment or table.
 */
export function escapeLineSyntax(tree: Parent): void {
  rewriteLines(tree, starts => {
    // back to front, so earlier offsets and indices stay valid
    for (const { segment, offset, line } of starts.reverse()) {
      if (readsAsLineSyntax(line)) {
        escapeLineStart(segment, offset)
      }
    }
  })
}

function escapeLineStart(
  { node, siblings, index, opens }: Segment,
  offset: number
): void {
  if (node.type === "text") {
    const value = node.value ?? ""
    node.value = value.slice(0, offset) + ZERO_WIDTH_SPACE + value.slice(offset)
  } else if (opens && offset === 0) {
    siblings.splice(index, 0, { type: "text", value: ZERO_WIDTH_SPACE } as Node)
  }
}

/**
 * org→md: drops the line-start zero-width spaces `escapeLineSyntax`
 * inserts.
 */
export function unescapeLineSyntax(tree: Parent): void {
  rewriteLines(
    tree,
    starts => {
      for (const { segment, offset } of starts.reverse()) {
        const { node } = segment
        const value = node.value ?? ""
        if (node.type === "text" && value[offset] === ZERO_WIDTH_SPACE) {
          node.value = value.slice(0, offset) + value.slice(offset + 1)
        }
      }
    },
    holdsZeroWidthSpace
  )
}

function holdsZeroWidthSpace(children: Node[]): boolean {
  return children.some(child =>
    "children" in child
      ? holdsZeroWidthSpace(child.children as Node[])
      : child.type === "text" && child.value?.includes(ZERO_WIDTH_SPACE)
  )
}
