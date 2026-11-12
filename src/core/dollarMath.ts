import type { OrgData } from "uniorg"
import type { Node } from "unist"
import { EXIT, visit } from "unist-util-visit"
import { freeMark } from "./marks.js"
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
// parse. The mark is a private use character the text does not hold

type Fragment = Node & { value: string; contents: string }

// what ends content org reads no `$x$` around (uniorg checks the
// closing `$` against it instead)
const BAD_END = String.raw`[ \t\n,.]`
const BAD_END_RE = new RegExp(`${BAD_END}$`)
const BAD_CLOSE_RE = new RegExp(`${BAD_END}\\$`, "g")

function isMisread(node: Node): boolean {
  const { value, contents } = node as Fragment
  return /^\$(?!\$)/.test(value) && BAD_END_RE.test(contents)
}

// a misread needs a `$`, and after it a blank, `,` or `.` right before
// a `$`: else no walk
function mayMisread(org: string): boolean {
  const first = org.indexOf("$")
  if (first === -1) {
    return false
  }
  BAD_CLOSE_RE.lastIndex = first + 1
  return BAD_CLOSE_RE.test(org)
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

function restoreDollars(tree: OrgData, mark: string): void {
  visit(tree, (node: Node) => {
    const record = node as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === "string" && value.includes(mark)) {
        record[key] = value.replaceAll(mark, "$")
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
  if (!mayMisread(org) || !hasMisread(tree)) {
    return tree
  }
  const mark = freeMark(org)
  let marked = org
  do {
    const found = misreadOffsets(marked)
    // the positioned parse reads it otherwise (another `^:` setting)
    if (!found.length) {
      break
    }
    const chars = marked.split("")
    for (const at of found) {
      chars[at] = mark
    }
    marked = chars.join("")
    tree = parse(marked)
  } while (hasMisread(tree))
  if (marked !== org) {
    restoreDollars(tree, mark)
  }
  return tree
}
