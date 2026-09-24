import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { SKIP, visit } from "unist-util-visit"

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

type Node = Parent["children"][number] & { value?: string }

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
  defuseLiteralMarkers(tree)
  separateMarkupBoundaries(tree)
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

const MARKERS_RE = /[*/_=~+]/g
// org's emphasis rule, loosened: a marker, a non-blank after it, the
// same marker closing after a non-blank, then an allowed char, a table
// cell border or the end. The char before the opening marker is left
// open, as uniorg does not always check it. Text this does not match
// cannot hold markup, and skips the parse
const MAY_HOLD_MARKUP_RE =
  /([*/_=~+])[^\s\u200B](?:[\s\S]*?[^\s\u200B])?\1(?:$|[-–—\s\u200B.,:!?;'’"“”)}[|])/
const DEFUSED_MARKER_RE = /([*/_=~+])\u200B/g

const positionParser = unified()
  .use(uniorgParse, { trackPosition: true })
  .freeze()

// offsets of the opening markers of the outermost markup org reads in
// `text`
function markupOffsets(text: string): number[] {
  const offsets: number[] = []
  visit(positionParser.parse(text) as Parent, (node: Node) => {
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

// a zero-width space after an opening marker leaves org nothing to read
// as markup (content may not start with one). Defusing an outer pair can
// expose an inner one, hence the rounds; each defuses at least one
// marker, so there are at most as many rounds as markers
function defuseLiteralMarkers(tree: Parent): void {
  visit(tree, "text", (node: Node) => {
    let value = node.value ?? ""
    if (!MAY_HOLD_MARKUP_RE.test(value)) {
      return
    }
    let rounds = value.match(MARKERS_RE)?.length ?? 0
    let offsets
    while (rounds-- > 0 && (offsets = markupOffsets(value)).length) {
      for (const offset of offsets.reverse()) {
        value =
          value.slice(0, offset + 1) +
          ZERO_WIDTH_SPACE +
          value.slice(offset + 1)
      }
    }
    node.value = value
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
