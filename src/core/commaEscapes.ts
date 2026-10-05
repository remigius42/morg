import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import type { Node } from "./render.js"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// Org escapes a code line starting `*` or `#+` with a comma after its
// indentation (`  ,* x`), and reading it back drops that comma only.
// uniorg's `unescapeCodeInString` drops the indentation with it. A mark
// between the indentation and the comma keeps uniorg from unescaping
// the line; morg unescapes it after the parse, as org does
const MARK = "\uE000"

const ESCAPED_LINE_RE = /^([ \t]*)(?=,+(?:\*|#\+))/
const BLOCK_START_RE = /^[ \t]*#\+begin_(src|export|example)(?:[ \t]|$)/i

/**
 * org→md: marks the comma-escaped lines of src, export and example
 * blocks before parsing.
 */
export function guardCommaEscapes(org: string): string {
  if (!org.includes(",")) {
    return org
  }
  const lines = org.split("\n")
  let end: RegExp | null = null
  for (const [i, line] of lines.entries()) {
    if (end) {
      if (end.test(line)) {
        end = null
      } else {
        lines[i] = line.replace(ESCAPED_LINE_RE, `$1${MARK}`)
      }
      continue
    }
    const block = BLOCK_START_RE.exec(line)?.[1]
    end = block ? new RegExp(`^[ \\t]*#\\+end_${block}[ \\t]*$`, "i") : null
  }
  return lines.join("\n")
}

const CODE_BLOCKS = new Set(["src-block", "export-block", "example-block"])
const MARKED_RE = new RegExp(`^([ \\t]*)${MARK}`, "gm")
const UNESCAPE_RE = new RegExp(`^([ \\t]*)${MARK},`, "gm")

/**
 * org→md: unescapes the marked lines of src, export and example blocks
 * (which uniorg leaves escaped), keeping their indentation; drops a mark
 * anywhere else uniorg put the line.
 */
export function unescapeCommaEscapes(tree: Parent): void {
  visit(tree, (node: Node) => {
    if (typeof node.value !== "string" || !node.value.includes(MARK)) {
      return
    }
    const code = CODE_BLOCKS.has(node.type)
    node.value = node.value.replace(code ? UNESCAPE_RE : MARKED_RE, "$1")
  })
}

/**
 * md→org: org's own block escaping (org-escape-code-in-string): a line
 * org would read as a headline or a keyword, or one already escaped,
 * gets a comma.
 */
export function escapeBlockLines(text: string): string {
  return text.replace(/^([ \t]*)(,*(?:\*|#\+))/gm, "$1,$2")
}
