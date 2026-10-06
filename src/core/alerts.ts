import type { BlockContent, Paragraph, PhrasingContent, Root } from "mdast"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"

// a GFM alert (`> [!NOTE]`) is an org special block (`#+begin_note`).
// A type of other characters stays org text: `.`, `:`, `|`, `+` mean
// something else in Obsidian's callouts, `]` ends the marker. Org's own
// blocks (example, quote, …) are no special blocks, so Obsidian
// callouts of their names stay quotes; a query block's body is no
// Markdown
const ALERT_TYPE_RE = /^[A-Za-z][\w-]*$/
const NOT_ALERTS = new Set([
  "center",
  "comment",
  "example",
  "export",
  "quote",
  "src",
  "verse",
  "query"
])

/** Whether a special block of this type is a GFM alert. */
export function isAlertType(type: string): boolean {
  return ALERT_TYPE_RE.test(type) && !NOT_ALERTS.has(type.toLowerCase())
}

/**
 * org→md: an alert's marker line, its title the block's parameters.
 * @param type The special block's type.
 * @param parameters The block's parameters, if any.
 * @returns The marker line, as Markdown text.
 */
export function alertMarker(type: string, parameters?: string): string {
  return `[!${type.toUpperCase()}]${parameters ? ` ${parameters}` : ""}`
}

// a callout's marker in a quote's text, of a type that is no alert
const CALLOUT_RE = /^\[!([\p{L}\p{N}_.:|-]+)\](?=[ \t\n]|$)/u

/**
 * org→md: a quote whose text starts with the marker of a callout of no
 * alert type (Obsidian's `[!example]`) keeps it as written; escaped,
 * Obsidian would show it as text. md→org reads it back as text.
 * @param children The quote's Markdown children.
 */
export function keepCalloutMarker(children: BlockContent[]): void {
  const paragraph = leadingParagraph(children)
  const head = paragraph?.children[0]
  if (!paragraph || head?.type !== "text") {
    return
  }
  const match = CALLOUT_RE.exec(head.value)
  if (!match?.[1] || isAlertType(match[1])) {
    return
  }
  const rest = head.value.slice(match[0].length)
  paragraph.children.splice(
    0,
    1,
    { type: "verbatimInline", value: match[0] } as unknown as PhrasingContent,
    ...(rest ? [{ type: "text" as const, value: rest }] : [])
  )
}

function leadingParagraph(children: Parent["children"]): Paragraph | undefined {
  const first = children[0]
  return first?.type === "paragraph" ? (first as Paragraph) : undefined
}

/** md→org: a quote read as an alert, for a special block. */
export interface Alert extends Parent {
  type: "alert"
  blockType: string
  parameters?: string
  children: BlockContent[]
}

// the marker line, in the source: an escaped `\[!NOTE]` is text
const MARKER_RE = /\[!([^\]\s]+)\](?:[ \t]+([^\n]*?))?[ \t]*(?:\r?\n|$)/y

/**
 * md→org: reads each quote opening with an alert's marker line as an
 * alert, its title taken from the source as written.
 * @param mdast The tree parsed from `markdown`.
 * @param markdown The Markdown source.
 */
export function readAlerts(mdast: Root, markdown: string): void {
  if (!markdown.includes("[!")) {
    return
  }
  visit(mdast as Parent, "blockquote", (node: Parent) => {
    const first = leadingParagraph(node.children)
    const marker = first && alertMarkerAt(first, markdown)
    if (!first || !marker) {
      return
    }
    dropFirstLine(first)
    if (!first.children.length) {
      node.children.shift()
    }
    Object.assign(node, marker)
  })
}

// the alert a paragraph's marker line starts, in the source
function alertMarkerAt(
  paragraph: Paragraph,
  markdown: string
): Pick<Alert, "type" | "blockType" | "parameters"> | undefined {
  MARKER_RE.lastIndex = paragraph.position?.start.offset ?? markdown.length
  const [, type, parameters] = MARKER_RE.exec(markdown) ?? []
  if (!type || !isAlertType(type)) {
    return undefined
  }
  return {
    type: "alert",
    blockType: type.toLowerCase(),
    ...(parameters && { parameters })
  }
}

// a paragraph's first line, up to its first line break
function dropFirstLine(paragraph: Paragraph): void {
  while (paragraph.children.length) {
    const head = paragraph.children[0]!
    const end = head.type === "text" ? head.value.indexOf("\n") : -1
    if (end >= 0 && head.type === "text") {
      head.value = head.value.slice(end + 1)
      if (!head.value) {
        paragraph.children.shift()
      }
      return
    }
    paragraph.children.shift()
    if (head.type === "break") {
      return
    }
  }
}
