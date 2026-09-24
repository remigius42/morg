import type { Parent } from "unist"
import { visit } from "unist-util-visit"

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
 * md→org: separates markup from a neighbor org would not accept as its
 * boundary (`a~x~s`, `[[u]]/i/`) with a zero-width space, which would
 * otherwise leave the markers as literal text.
 */
export function separateMarkupBoundaries(tree: Parent): void {
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

/**
 * org→md: drops the zero-width spaces that only separate markup from its
 * neighbors, the inverse of `separateMarkupBoundaries`.
 */
export function dropMarkupBoundaries(tree: Parent): void {
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
