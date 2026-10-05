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
 * formulas below it, apart from it before parsing, outside blocks.
 */
export function separateTableKeywords(org: string): string {
  if (!org.includes("#+")) {
    return org
  }
  const lines = org.split("\n")
  const out: string[] = []
  let end: RegExp | null = null
  for (const [i, line] of lines.entries()) {
    out.push(line)
    if (end) {
      end = end.test(line) ? null : end
      continue
    }
    const block = BLOCK_START_RE.exec(line)?.[1]
    if (block) {
      end = blockEndRe(block)
    } else if (bordersTable(line, lines[i + 1] ?? "")) {
      out.push("")
    }
  }
  return out.join("\n")
}
