import type { OrgData } from "uniorg"
import { blockEndRe } from "./orgBlocks.js"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue
// uniorg#151; the joined formulas: not filed yet, see
// TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// uniorg reads the affiliated keywords above an org table (`#+NAME:`,
// `#+CAPTION:`, `#+RESULTS:`), then leaves them off the table node: they
// are lost. A blank line in between makes them keywords of their own,
// which org→md writes as lines above the table; md→org writes them
// right above it again, where org attaches them. It joins the
// `#+TBLFM:` lines below a table into one formula, with nothing in
// between: set apart, they are keywords too, which md→org writes right
// below the table again
const AFFILIATED_RE =
  /^[ \t]*#\+(?:(?:CAPTION|RESULTS)(?:\[.*\])?|DATA|HEADERS?|LABEL|NAME|PLOT|RESNAME|RESULT|SOURCE|SRCNAME|TBLNAME|ATTR_[-\w]+):/i
const TABLE_RE = /^[ \t]*\|/
const FORMULA_RE = /^[ \t]*#\+TBLFM:/i
const BLOCK_START_RE = /^[ \t]*#\+begin_(\S+)/i
const VERBATIM_BLOCK_RE = /^(?:comment|example|export|src|verse)$/i

// whether a line and the next are a keyword and its table, or a table
// and its formula
function bordersTable(line: string, next: string): boolean {
  return (
    (AFFILIATED_RE.test(line) && TABLE_RE.test(next)) ||
    (TABLE_RE.test(line) && FORMULA_RE.test(next))
  )
}

/**
 * org→md: sets the affiliated keywords above an org table, and the
 * formulas below it, apart from it before parsing, outside verbatim
 * blocks.
 * @returns The org text, and where each table whose keywords it set
 *   apart starts in it (a set-apart formula's start too).
 */
export function separateTableKeywords(org: string): {
  org: string
  tables: Set<number>
} {
  const tables = new Set<number>()
  if (!org.includes("#+")) {
    return { org, tables }
  }
  const lines = org.split("\n")
  const out: string[] = []
  let offset = 0
  let end: RegExp | null = null
  for (const [i, line] of lines.entries()) {
    out.push(line)
    offset += line.length + 1
    if (end) {
      end = end.test(line) ? null : end
      continue
    }
    const block = BLOCK_START_RE.exec(line)?.[1]
    const next = lines[i + 1] ?? ""
    // a verbatim block's lines stay; a greater block's content is org
    if (block && VERBATIM_BLOCK_RE.test(block)) {
      end = blockEndRe(block)
    } else if (bordersTable(line, next)) {
      // a table's start, or a formula's no table starts at
      out.push("")
      tables.add(++offset)
    }
  }
  return { org: out.join("\n"), tables }
}

const tablesWithKeywords = new WeakSet<object>()

/**
 * org→md: marks the top-level tables whose keywords
 * separateTableKeywords set apart.
 * @param uniorgAst The document parsed from its org text.
 * @param tables Where each such table starts in that text.
 */
export function markTablesWithKeywords(
  uniorgAst: OrgData,
  tables: Set<number>
): void {
  for (const node of uniorgAst.children) {
    if (
      node.type === "table" &&
      "contentsBegin" in node &&
      tables.has(node.contentsBegin)
    ) {
      tablesWithKeywords.add(node)
    }
  }
}

// whether a table had keywords directly above it, set apart by
// separateTableKeywords, not by a blank line of the author's
export function hasKeywordsAbove(node: object | undefined): boolean {
  return !!node && tablesWithKeywords.has(node)
}
