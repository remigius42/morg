import type { Parent } from "unist"
import { visit } from "unist-util-visit"
// a line starting with a zero-width space is no org line syntax (list
// item, headline, comment, keyword, table, ...), but renders as text
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"
import {
  delimiters,
  isInline,
  locate,
  positionParser,
  renderInline,
  tryParse,
  type Node
} from "./render.js"

// org line syntax starts with one of a few punctuation chars (`- `,
// `+ `, `* `, `# `, `| `, `:`, `[fn:`, `\begin`, `%%(`) or with a word
// followed by `.`, `)` or `:` (`1.`, `a)`, `CLOCK:`, `_.`); any other
// line (one starting with a link or code, say) is text, and skips the
// parse
const MAY_BE_LINE_SYNTAX_RE = /^[-+*#|:[\\%]|^[\p{L}\p{N}_]+[.):]/u

// whether org reads `line` as anything but a plain paragraph
function readsAsLineSyntax(line: string): boolean {
  if (!MAY_BE_LINE_SYNTAX_RE.test(line)) {
    return false
  }
  // with its newline: a bullet ending the line (`1.`) needs one
  const tree = tryParse(`${line}\n`)
  if (!tree) {
    // escaped, uniorg reads the line as text too
    return true
  }
  const [first, ...rest] = tree.children
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
  // the line's index in the content
  number: number
}

// where a paragraph's, or a list item's flattened, inline content sits:
// the first line of a list item (or of its first paragraph), or of a
// footnote definition's first paragraph, follows the bullet or label;
// a paragraph right below a headline may read as its planning
interface Context {
  afterBullet: boolean
  afterHeadline: boolean
}

// the lines of the content as org renders it, not per text node: a
// line may start with another node (`[fn:1] a`) or its syntax span
// nodes (`* ~x~`). A line following a bullet or label has no start
function lineStarts(
  children: Node[],
  { afterBullet }: Context
): { starts: LineStart[]; lines: string[] } {
  const parts = segments(children)
  const rendered = parts.map(part => part.text)
  const content = rendered.join("")
  const breaks = [0]
  for (
    let i = content.indexOf("\n");
    i !== -1;
    i = content.indexOf("\n", i + 1)
  ) {
    breaks.push(i + 1)
  }
  const starts = breaks.flatMap((lineBreak, number) => {
    // org keeps a continuation line's indentation in the text
    const [, indent = "", line = ""] =
      /^([ \t]*)(.*)/.exec(content.slice(lineBreak)) ?? []
    const [index, offset] = locate(rendered, lineBreak + indent.length)
    const segment = parts[index]
    return line && segment && !(afterBullet && number === 0)
      ? [{ segment, offset, line, number }]
      : []
  })
  return { starts, lines: content.split("\n") }
}

// calls `rewrite` on every paragraph, and every list item whose inline
// content md→org flattens, with its context;
// `applies` skips the rendering where there is nothing to rewrite
function rewriteLines(
  tree: Parent,
  rewrite: (children: Node[], context: Context) => void,
  applies: (children: Node[]) => boolean = () => true
): void {
  visit(tree, (node: Node | Parent, index, parent: Parent | undefined) => {
    if (node.type !== "paragraph" && node.type !== "list-item") {
      return
    }
    const children = (node as Parent).children as Node[]
    if (applies(children)) {
      rewrite(children, contextOf(node, index ?? 0, parent))
    }
  })
}

function contextOf(
  node: Node | Parent,
  index: number,
  parent: Parent | undefined
): Context {
  return {
    afterBullet:
      node.type === "list-item" ||
      (index === 0 &&
        (parent?.type === "list-item" ||
          parent?.type === "footnote-definition")),
    afterHeadline: parent?.children[index - 1]?.type === "headline"
  }
}

/**
 * md→org: a paragraph line org would read as line syntax (an escaped
 * `1\.` or `\*`, or a lazy continuation line) gets a leading zero-width
 * space, or it would turn into a list item, headline, comment or table.
 */
export function escapeLineSyntax(tree: Parent): void {
  rewriteLines(tree, (children, context) => {
    const { starts } = lineStarts(children, context)
    // passthrough is a paragraph of its own
    if (!context.afterBullet && isPassthrough(starts)) {
      return
    }
    // back to front, so earlier offsets and indices stay valid
    for (const { segment, offset, line } of starts.reverse()) {
      if (readsAsLineSyntax(line)) {
        escapeLineStart(segment, offset)
      }
    }
    escapeElementStarts(children, context)
  })
}

// org→md writes these org elements as md paragraphs of their org text,
// to be read back as such (verbatim passthrough, see mappings.md)
const PASSTHROUGH_TYPES = new Set([
  "fixed-width",
  "drawer",
  "clock",
  "diary-sexp",
  "keyword",
  "babel-call",
  "special-block",
  "center-block",
  "verse-block",
  "comment-block",
  "export-block"
])

// whether org reads the lines, all of them starting a line, as just
// one passthrough element
function isPassthrough(starts: LineStart[]): boolean {
  const [first] = starts
  if (!first || !MAY_BE_LINE_SYNTAX_RE.test(first.line)) {
    return false
  }
  const lines = starts.map(({ line }) => line)
  const [only, ...rest] = tryParse(`${lines.join("\n")}\n`)?.children ?? []
  return !rest.length && PASSTHROUGH_TYPES.has(only?.type ?? "")
}

// line syntax spanning lines (`#+begin_src`…`#+end_src`, a drawer) or
// depending on context (planning below a headline) shows only in the
// whole content as org reads it; each round escapes the first line of
// an element org reads there, as long as that exposes another
function escapeElementStarts(children: Node[], context: Context): void {
  const escaped = new Set<number>()
  for (;;) {
    const { starts, lines } = lineStarts(children, context)
    if (!starts.some(({ line }) => MAY_BE_LINE_SYNTAX_RE.test(line))) {
      return
    }
    const number = elementLine(lines, context)
    const start = starts.find(candidate => candidate.number === number)
    if (number === undefined || !start || escaped.has(number)) {
      return
    }
    escaped.add(number)
    escapeLineStart(start.segment, start.offset)
  }
}

// the index of the first content line org reads as the start of an
// element other than a paragraph, if any
function elementLine(lines: string[], context: Context): number | undefined {
  // a line after a bullet only continues the item's text
  const content = context.afterBullet ? ["x", ...lines.slice(1)] : lines
  const prefix = context.afterHeadline ? ["* x"] : []
  const tree = tryParse([...prefix, ...content, ""].join("\n"), positionParser)
  const elements = (tree?.children ?? []).flatMap(node =>
    node.type === "section" && "children" in node
      ? (node.children as Node[])
      : [node]
  )
  const element = elements.find(
    node => node.type !== "paragraph" && node.type !== "headline"
  )
  const line = element?.position?.start.line
  return line === undefined ? undefined : line - 1 - prefix.length
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
    (children, context) => {
      const { starts } = lineStarts(children, context)
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
