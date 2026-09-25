import type { Parent } from "unist"
import { SKIP, visit } from "unist-util-visit"
import {
  locate,
  positionParser,
  renderChildren,
  tryParse,
  type Node
} from "./render.js"

// the org manual's escape character: a zero-width space is a valid
// markup boundary (uniorg lists it in its emphasis regexp components)
// but renders as nothing
export const ZERO_WIDTH_SPACE = "\u200B"

const MARKUP_TYPES = new Set([
  "bold",
  "italic",
  "underline",
  "strike-through",
  "code",
  "verbatim"
])

// characters org accepts directly before an opening / after a closing
// marker (uniorg's emphasisRegexpComponents pre / post)
const PRE_RE = /[-–—\s\u200B('’"“”{]$/
const POST_RE = /^[-–—\s\u200B.,:!?;'’"“”)}[]/

function isMarkup(node: Node | undefined): boolean {
  return MARKUP_TYPES.has(node?.type ?? "")
}

function allowsMarkupAfter(node: Node | undefined): boolean {
  if (!node) {
    return true
  }
  if (node.type === "text") {
    return !node.value || PRE_RE.test(node.value)
  }
  return false
}

function allowsMarkupBefore(node: Node | undefined): boolean {
  if (!node) {
    return true
  }
  if (node.type === "text") {
    return !node.value || POST_RE.test(node.value)
  }
  // a link opens with `[`
  return node.type === "link"
}

/**
 * md→org: escapes with zero-width spaces what org would otherwise misread:
 * literal markers in text that form markup (`/etc/`), and markup whose
 * neighbor is no valid boundary (`a~x~s`), which would stay literal.
 */
export function escapeOrgMarkup(tree: Parent): void {
  // the separators are valid markup boundaries, so literal markers are
  // checked next to them
  separateMarkupBoundaries(tree)
  defuseLiteralMarkers(tree)
}

/**
 * org→md: drops the zero-width spaces `escapeOrgMarkup` inserts.
 */
export function unescapeOrgMarkup(tree: Parent): void {
  dropMarkupBoundaries(tree)
  visit(tree, "text", (node: Node) => {
    node.value = node.value?.replace(DEFUSED_MARKER_RE, "$1")
  })
}

const MARKER_RE = /[*/_=~+]/
const MARKERS_RE = new RegExp(MARKER_RE.source, "g")
// org's emphasis rule, loosened, from an opening marker on: a non-blank
// after it, the same marker closing after a non-blank, then an allowed
// char, a table cell border or the end (the char before the marker is
// checked apart)
const MAY_OPEN_MARKUP_RE =
  /([*/_=~+])[^\s\u200B](?:[\s\S]*?[^\s\u200B])?\1(?:$|[-–—\s\u200B.,:!?;'’"“”)}[|])/y
const DEFUSED_MARKER_RE = /([*/_=~+])\u200B/g

// offsets of the opening markers of the outermost markup org reads in
// `text`; none where uniorg fails to read it
function markupOffsets(text: string): number[] {
  const tree = tryParse(text, positionParser)
  if (!tree) {
    return []
  }
  const offsets: number[] = []
  visit(tree, (node: Node) => {
    if (!isMarkup(node)) {
      return undefined
    }
    const offset = node.position?.start.offset
    if (offset !== undefined) {
      offsets.push(offset)
    }
    return SKIP
  })
  return offsets
}

function holdsMarker(node: Node): boolean {
  return node.type === "text" && MARKER_RE.test(node.value ?? "")
}

// [child index, offset in its rendering] of each opening marker org
// reads as markup that lies in a text child, i.e. is a literal marker
function literalMarkers(
  children: Node[],
  rendered: string[]
): [number, number][] {
  return markupOffsets(rendered.join(""))
    .map(offset => locate(rendered, offset))
    .filter(([i]) => children[i]?.type === "text")
}

// whether a marker in a text child may open markup, by the rule above:
// a marker another node renders (bold's `*`) needs no escape, so
// neither it nor a marker org cannot read as markup takes a parse
function mayHoldLiteralMarkup(children: Node[], rendered: string[]): boolean {
  const line = rendered.join("")
  let start = 0
  return rendered.some((part, i) => {
    const offset = start
    start += part.length
    return (
      children[i]?.type === "text" &&
      [...part.matchAll(MARKERS_RE)].some(({ index }) => {
        MAY_OPEN_MARKUP_RE.lastIndex = offset + index
        return mayOpenAt(part, index) && MAY_OPEN_MARKUP_RE.test(line)
      })
    )
  })
}

// uniorg checks the char before an opening marker (`a/b/` is no
// markup), unless there is none in the text it parses: a char of another
// node's rendering counts as none. It reads a marker after one (`#**x*`)
// by backing off onto the first, which then opens without that check
function mayOpenAt(text: string, index: number): boolean {
  const before = text[index - 1]
  return (
    before === undefined ||
    PRE_RE.test(before) ||
    // uniorg opens after a table cell border too, found by fuzzing
    before === "|" ||
    MARKER_RE.test(text[index + 1] ?? "")
  )
}

// a zero-width space after an opening marker leaves org nothing to read
// as markup (content may not start with one). Defusing an outer pair can
// expose an inner one, hence the rounds; each defuses at least one
// marker, so there are at most as many rounds as markers
function defuseRendered(children: Node[], rendered: string[]): void {
  let rounds = rendered.join("").match(MARKERS_RE)?.length ?? 0
  let markers
  while (
    rounds-- > 0 &&
    mayHoldLiteralMarkup(children, rendered) &&
    (markers = literalMarkers(children, rendered)).length
  ) {
    for (const [i, offset] of markers.reverse()) {
      const part = rendered[i] ?? ""
      rendered[i] =
        part.slice(0, offset + 1) + ZERO_WIDTH_SPACE + part.slice(offset + 1)
    }
  }
}

// checked on the rendered line, not per text node: another inline node
// may split a literal pair (`*b ~x~ c*`)
function defuseLiteralMarkers(tree: Parent): void {
  visit(tree, (node: Node | Parent) => {
    if (!("children" in node) || !node.children.some(holdsMarker)) {
      return
    }
    const children = node.children as Node[]
    const rendered = renderChildren(children)
    defuseRendered(children, rendered)
    for (const [i, child] of children.entries()) {
      if (child.type === "text") {
        child.value = rendered[i]
      }
    }
  })
}

function separateMarkupBoundaries(tree: Parent): void {
  visit(tree, (node: Node | Parent) => {
    if (!("children" in node) || !node.children.some(isMarkup)) {
      return
    }
    const children: Node[] = []
    for (const [i, child] of node.children.entries()) {
      if (isMarkup(child) && !allowsMarkupAfter(children.at(-1))) {
        children.push({ type: "text", value: ZERO_WIDTH_SPACE })
      }
      children.push(child)
      if (isMarkup(child) && !allowsMarkupBefore(node.children[i + 1])) {
        children.push({ type: "text", value: ZERO_WIDTH_SPACE })
      }
    }
    node.children = children
  })
}

function dropMarkupBoundaries(tree: Parent): void {
  visit(tree, "text", (node: Node, index, parent: Parent | undefined) => {
    if (index === undefined || !parent) {
      return
    }
    let value = node.value ?? ""
    if (
      isMarkup(parent.children[index + 1]) &&
      value.endsWith(ZERO_WIDTH_SPACE)
    ) {
      value = value.slice(0, -1)
    }
    if (
      isMarkup(parent.children[index - 1]) &&
      value.startsWith(ZERO_WIDTH_SPACE)
    ) {
      value = value.slice(1)
    }
    node.value = value
  })
}
