// an org bracket-link path cannot contain [ or ], and `::` starts its
// search option. morg percent-encodes those (uniorg does not decode org's
// own backslash escaping); a literal % in front of such an escape gets
// one more `25`, so the encoding stays reversible (`%5B` ↔ `%255B`)
const ESCAPE_RE = /%((?:25)*)(5B|5D|3A)/g
const ESCAPED: Record<string, string> = { "5B": "[", "5D": "]", "3A": ":" }

/**
 * md→org: a decoded file link path, or its search option, as org link
 * text.
 */
export function escapeOrgPath(part: string, isSearch = false): string {
  const escaped = part
    .replace(ESCAPE_RE, "%25$1$2")
    .replaceAll("[", "%5B")
    .replaceAll("]", "%5D")
  // a colon next to another, or before the `::` separator
  return isSearch ? escaped : escaped.replace(/:(?=:|$)/g, "%3A")
}

/**
 * org→md: the inverse of `escapeOrgPath`.
 */
export function unescapeOrgPath(part: string): string {
  return part.replace(ESCAPE_RE, (_, more: string, code: string) =>
    more ? `%${more.slice(2)}${code}` : (ESCAPED[code] ?? code)
  )
}
