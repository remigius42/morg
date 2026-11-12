import type { Node, Parent } from "unist"
import { visit } from "unist-util-visit"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
type Cookie = Node & { end: number; postBlank?: number }
type Text = Node & { value: string }

// uniorg-parse 3.2.2's cookie (`parseStatisticsCookie`), a blank after
// it, which it swallows with `\s*`
const COOKIE_BLANK_RE = /\[\d*(?:%|\/\d*)\]\s/

/**
 * org→md: uniorg-parse's statistics cookie swallows the blank after it
 * (`[1/2] b` reads as `[1/2]` then `b`), which puts it back in front of
 * what follows.
 * @param tree The parsed org.
 * @param source The org text it was parsed from.
 */
export function restoreCookieBlanks(tree: Parent, source: string): void {
  // uniorg's cookie pattern, a blank after it: else no walk
  if (!COOKIE_BLANK_RE.test(source)) {
    return
  }
  visit(tree, (node: Node, index, parent: Parent | undefined) => {
    if (node.type !== "statistics-cookie" || !parent || index === undefined) {
      return undefined
    }
    const cookie = node as Cookie
    const next = parent.children[index + 1]
    // at the end, the blank is the line's own
    if (!cookie.postBlank || !next) {
      return undefined
    }
    const blank = source.slice(cookie.end, cookie.end + cookie.postBlank)
    cookie.postBlank = 0
    if (next.type === "text") {
      ;(next as Text).value = blank + (next as Text).value
    } else {
      parent.children.splice(index + 1, 0, {
        type: "text",
        value: blank
      } as Text)
    }
    return undefined
  })
}
