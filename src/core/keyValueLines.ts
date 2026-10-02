// a `key:: value` line, Logseq's property syntax; an empty `key::` too
const KEY_VALUE_LINE_RE = /^([\w-]+)::(?: (.*))?$/

/**
 * The key, value pairs of a block of `key:: value` lines.
 * @param text The block's text.
 * @returns The pairs in order, or null if a line is none.
 */
export function keyValueEntries(text: string): [string, string][] | null {
  const entries: [string, string][] = []
  for (const line of text.replace(/\r?\n$/, "").split(/\r?\n/)) {
    const match = KEY_VALUE_LINE_RE.exec(line)
    if (!match) {
      return null
    }
    entries.push([match[1] ?? "", match[2] ?? ""])
  }
  return entries
}
