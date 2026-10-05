/**
 * The pattern of the line that ends an org block named `name`
 * (`#+end_src`), indented or not, case aside, trailing blanks (a CRLF
 * line's `\r`) included.
 */
export function blockEndRe(name: string): RegExp {
  return new RegExp(
    String.raw`^[ \t]*#\+end_${name.replace(/\W/g, "\\$&")}\s*$`,
    "i"
  )
}
