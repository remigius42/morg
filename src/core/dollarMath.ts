import type { OrgData } from "uniorg"
import type { Node } from "unist"
import { EXIT, visit } from "unist-util-visit"
import { positionParser } from "./render.js"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// Org reads no `$x$` whose content ends in a blank, `,` or `.`
// (`$5 and $\alpha$`: text, then the math `$\alpha$`). uniorg's
// `parseLatexFragment` tests the closing `$` instead of the character
// before it, so it reads `$5 and $` as math. A mark in place of such an
// opening `$` keeps uniorg from reading it; the `$` goes back after the
// parse
const MARK = "\uE002"
const MARK_RE = new RegExp(MARK, "g")

type Fragment = Node & { value: string; contents: string }

// content org reads no `$x$` around
const BAD_END_RE = /[ \t\n,.]$/

function isMisread(node: Node): boolean {
  const { value, contents } = node as Fragment
  return /^\$(?!\$)/.test(value) && BAD_END_RE.test(contents)
}

function hasMisread(tree: Node): boolean {
  let found = false
  visit(tree, "latex-fragment", (node: Node) => {
    found = isMisread(node)
    return found ? EXIT : undefined
  })
  return found
}

// the offsets of misread fragments; fragments carry them only where
// the parse tracks positions
function misreadOffsets(org: string): number[] {
  const offsets: number[] = []
  visit(positionParser.parse(org), "latex-fragment", (node: Node) => {
    const offset = node.position?.start.offset
    if (isMisread(node) && offset !== undefined) {
      offsets.push(offset)
    }
  })
  return offsets
}

function restoreDollars(tree: OrgData): void {
  visit(tree, (node: Node) => {
    const record = node as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string" && value.includes(MARK)) {
        record[key] = value.replace(MARK_RE, "$")
      }
    }
  })
}

/**
 * org→md: parses org as org reads `$x$` math, marking each opening `$`
 * uniorg misreads and parsing again until none is left.
 * @param org The org text.
 * @param parse The parser.
 * @returns The parsed org.
 */
export function parseDollarMath(
  org: string,
  parse: (org: string) => OrgData
): OrgData {
  let tree = parse(org)
  // the mark in the input is text, which the restore would take for its
  // own
  if (org.includes(MARK)) {
    return tree
  }
  let marked = org
  while (hasMisread(tree)) {
    const found = misreadOffsets(marked)
    // the positioned parse reads it otherwise (another `^:` setting)
    if (!found.length) {
      break
    }
    const chars = marked.split("")
    for (const at of found) {
      chars[at] = MARK
    }
    marked = chars.join("")
    tree = parse(marked)
  }
  if (marked !== org) {
    restoreDollars(tree)
  }
  return tree
}
