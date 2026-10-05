import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"

// org reads ` :: ` on a list item's first line as the end of a tag, its
// item a descriptive one; a zero-width space before the `::` leaves it
// text, as it does for Emacs (org-list-full-item-re)
const TAG_RE = /([ \t])::(?=[ \t]|$)/g
const ESCAPED_RE = new RegExp(`([ \\t])${ZERO_WIDTH_SPACE}::`, "g")

// objects whose text is on the line they start on
const CONTAINERS = new Set([
  "bold",
  "italic",
  "underline",
  "strike-through",
  "superscript",
  "subscript",
  "link",
  "footnote-reference"
])

/**
 * The comment org→md writes above a descriptive list no definition list
 * can hold (an item with a checkbox or without a term), kept in its
 * ` :: ` text; md→org reads the list below it back as descriptive
 * (ADR 0007 §3).
 */
export const DESCRIPTIVE_LIST_MARKER = "morg_descriptive_list"

interface OrgNode {
  type: string
  value?: string
  children?: OrgNode[]
  // a descriptive item's own ` :: ` (tagSeparator in mdastToUniorg)
  tagSeparator?: boolean
  // a list below the marker, its tags org's own
  descriptiveMarked?: boolean
}

// escapes a text node's part on the line; whether the line ended there
function escapeText(node: OrgNode & { value: string }): boolean {
  const end = node.value.indexOf("\n")
  const line = end === -1 ? node.value : node.value.slice(0, end)
  node.value =
    line.replace(TAG_RE, `$1${ZERO_WIDTH_SPACE}::`) +
    (end === -1 ? "" : node.value.slice(end))
  return end !== -1
}

// escapes the line's text up to its end; whether the line ended
function escapeLine(nodes: OrgNode[]): boolean {
  for (const node of nodes) {
    const ended = node.tagSeparator
      ? true
      : node.type === "text" && node.value !== undefined
        ? escapeText(node as OrgNode & { value: string })
        : CONTAINERS.has(node.type)
          ? escapeLine(node.children ?? [])
          : // a block in the item ends its first line
            node.children !== undefined
    if (ended) {
      return true
    }
  }
  return false
}

/**
 * md→org: escapes a literal ` :: ` on a list item's first line, which
 * org would read as a descriptive item's tag (ADR 0007); a descriptive
 * item's own separator stays, as does every ` :: ` of a marked list.
 */
export function escapeDescriptiveTags(tree: Parent): void {
  visit(tree, "list-item", (item: OrgNode, _index, list?: OrgNode) => {
    if (!list?.descriptiveMarked) {
      escapeLine(item.children ?? [])
    }
  })
}

/**
 * org→md: drops the zero-width spaces `escapeDescriptiveTags` inserts.
 */
export function unescapeDescriptiveTags(tree: Parent): void {
  visit(tree, "text", (node: OrgNode) => {
    node.value = node.value?.replace(ESCAPED_RE, "$1::")
  })
}
