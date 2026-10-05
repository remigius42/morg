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

/**
 * The marker comment above `key:: value` lines org→md writes from a
 * headline's property drawer when a value may read as Markdown: md→org
 * then takes the values as the org text they are. Unmarked lines are
 * Markdown, a person's (an Obsidian Dataview field).
 */
export const PROPERTIES_MARKER = "morg_properties"

// what Markdown may read as syntax: markup, links, autolinks, math,
// escapes, HTML and entities
const MARKDOWN_SYNTAX_RE = /[\\`*_~$[\]<>!&|]|:\/\/|www\.|@/

/**
 * Whether Markdown may read `value` as more than its text.
 */
export function mayReadAsMarkdown(value: string): boolean {
  return MARKDOWN_SYNTAX_RE.test(value)
}
