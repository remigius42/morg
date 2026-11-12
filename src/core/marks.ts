// marks the uniorg-parse workarounds put in org text before parsing
// and take out of the tree after

/**
 * A private use character a text does not hold, to mark it with.
 * @param org The text.
 * @param from The first character to try; each guard its own range.
 */
export function freeMark(org: string, from = 0xe100): string {
  let code = from
  while (org.includes(String.fromCharCode(code))) {
    code++
  }
  return String.fromCharCode(code)
}
