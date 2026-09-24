import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { ZERO_WIDTH_SPACE } from "./markupBoundary.js"
import type { Node } from "./render.js"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// Its `listItemRe` takes a line starting `_.` or `_)` for a list item
// (`\w` includes `_`), but its `fullListItemRe`, like org itself, has
// no such bullet. `parseListStructure` then throws (`match error`), or,
// when a real bullet line follows, reads that one instead and silently
// drops the line. Org reads the line as text, and so does uniorg with a
// zero-width space in front (morg's line-start escape, see lineSyntax)
const UNDERSCORE_BULLET_RE = /^([ \t]*)(?=_[.)](?:[ \t]|$))/gm

/**
 * org→md: guards the lines uniorg misreads before parsing.
 */
export function guardUnderscoreBullets(org: string): string {
  return org.replace(UNDERSCORE_BULLET_RE, `$1${ZERO_WIDTH_SPACE}`)
}

const GUARD_RE = new RegExp(
  `(^|\\n)([ \\t]*)${ZERO_WIDTH_SPACE}(?=_[.)](?:[ \\t\\n]|$))`,
  "g"
)

/**
 * org→md: drops the guards again, also where uniorg reads no text (a
 * src block's code). A zero-width space the author put there goes too.
 */
export function dropUnderscoreBulletGuards(tree: Parent): void {
  visit(tree, (node: Node) => {
    if (typeof node.value === "string") {
      node.value = node.value.replace(GUARD_RE, "$1$2")
    }
  })
}
