import type { Node } from "unist"
import { visit } from "unist-util-visit"
import { freeMark } from "./marks.js"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// It reads stars opening a list item's text (`- * a`, `- [ ] * a`,
// `- a :: * b`) as a headline inside the item, where org reads a
// headline at a line's start only and the item's text as `* a`. A mark
// in front of the stars keeps uniorg from it; the mark, a character the
// text does not hold, goes again after the parse, wherever uniorg put it
const FIRST_MARK = 0xe200

// uniorg's `fullListItemRe` up to the item's text: bullet (a `*` one
// indented), counter, checkbox
const ITEM_RE = new RegExp(
  [
    String.raw`^((?:[ \t]*(?:[-+]|(?:\d+|[a-z])[.)])|[ \t]+\*)[ \t]+`,
    String.raw`(?:\[@(?:start:)?(?:\d+|[a-z])\][ \t]*)?`,
    String.raw`(?:\[[ x-]\][ \t]+)?)(.*)$`
  ].join(""),
  "gim"
)
// a description item's tag, as uniorg reads it: up to the first ` ::`
const TAG_END_RE = /[ \t]::(?=[ \t]|$)/

// the tag with its ` :: ` and the text after it, if any
function splitTag(text: string): [string, string] | undefined {
  const at = text.search(TAG_END_RE)
  if (at === -1) {
    return undefined
  }
  const rest = text.slice(at + 3)
  const blanks = rest.length - rest.trimStart().length
  return [text.slice(0, at + 3 + blanks), rest.slice(blanks)]
}
const STARS_RE = /^\*+(?:[ \t]|$)/

function guarded(text: string, mark: string): string {
  return STARS_RE.test(text) ? mark + text : text
}

/**
 * org→md: marks the stars opening list item text before parsing.
 * @param org The org text.
 * @returns The marked text, and the mark if it holds any.
 */
export function guardStarItems(org: string): { org: string; mark?: string } {
  if (!org.includes("*")) {
    return { org }
  }
  const mark = freeMark(org, FIRST_MARK)
  const marked = org.replace(ITEM_RE, (_, item: string, text: string) => {
    const tag = splitTag(text)
    return tag
      ? item + guarded(tag[0], mark) + guarded(tag[1], mark)
      : item + guarded(text, mark)
  })
  return marked === org ? { org } : { org: marked, mark }
}

/**
 * org→md: drops the marks again, from every string uniorg read them
 * into (item text, a tag, a src block's code).
 * @param tree The parsed org.
 * @param mark The mark guardStarItems used, if any.
 */
export function dropStarItemGuards(tree: Node, mark?: string): void {
  if (!mark) {
    return
  }
  visit(tree, (node: Node) => {
    const record = node as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string" && value.includes(mark)) {
        record[key] = value.replaceAll(mark, "")
      }
    }
  })
}
