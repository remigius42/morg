import type { Parent } from "unist"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { EXIT, visit } from "unist-util-visit"

// the org manual's escape character: a zero-width space is a valid
// markup boundary (uniorg lists it in its emphasis regexp components)
// but renders as nothing
const ZERO_WIDTH_SPACE = "\u200B"

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

const MARKER_RE = /[*/_=~+]/
const DEFUSED_MARKER_RE = /([*/_=~+])\u200B/g

// offset of the opening marker of the first markup org reads in `text`
function firstMarkupOffset(text: string): number | undefined {
  const tree = unified().use(uniorgParse, { trackPosition: true }).parse(text)
  let offset: number | undefined
  visit(tree as Parent, (node: Node) => {
    if (isMarkup(node)) {
      offset = node.position?.start.offset
      return EXIT
    }
    return undefined
  })
  return offset
}

// a zero-width space after an opening marker leaves org nothing to read
// as markup (content may not start with one); one marker per pass, as
// defusing an outer pair can expose an inner one
function defuseLiteralMarkers(tree: Parent): void {
  visit(tree, "text", (node: Node) => {
    let value = node.value ?? ""
    if (!MARKER_RE.test(value)) {
      return
    }
    let offset
    let previous = -1
    // each pass must move forward, whatever uniorg makes of the escape
    while (
      (offset = firstMarkupOffset(value)) !== undefined &&
      offset > previous
    ) {
      previous = offset
      value =
        value.slice(0, offset + 1) + ZERO_WIDTH_SPACE + value.slice(offset + 1)
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
