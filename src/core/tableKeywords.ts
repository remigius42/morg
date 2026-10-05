// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in; the
// canary in tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// uniorg reads the affiliated keywords above an org table (`#+NAME:`,
// `#+CAPTION:`, `#+RESULTS:`), then leaves them off the table node: they
// are lost. A blank line in between makes them keywords of their own,
// which org→md writes as lines above the table; md→org writes them
// right above it again, where org attaches them
const AFFILIATED_RE =
  /^[ \t]*#\+(?:(?:CAPTION|RESULTS)(?:\[.*\])?|DATA|HEADERS?|LABEL|NAME|PLOT|RESNAME|RESULT|SOURCE|SRCNAME|TBLNAME|ATTR_[-\w]+):/i
const TABLE_RE = /^[ \t]*\|/
const BLOCK_START_RE = /^[ \t]*#\+begin_(\S+)/i

/**
 * org→md: sets the affiliated keywords above an org table apart from it
 * before parsing, outside blocks.
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
      end = new RegExp(
        `^[ \\t]*#\\+end_${block.replace(/\W/g, "\\$&")}[ \\t]*$`,
        "i"
      )
    } else if (AFFILIATED_RE.test(line) && TABLE_RE.test(lines[i + 1] ?? "")) {
      out.push("")
    }
  }
  return out.join("\n")
}
