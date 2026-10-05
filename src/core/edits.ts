/** A replacement of a source's `[start, end)` by `text`. */
export type Edit = [start: number, end: number, text: string]

/**
 * Applies edits of ranges that do not overlap, last first so the
 * offsets of the others hold.
 * @param text The source.
 * @param edits The edits, in any order.
 * @returns The edited text.
 */
export function applyEdits(text: string, edits: Edit[]): string {
  let result = text
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, start) + replacement + result.slice(end)
  }
  return result
}
