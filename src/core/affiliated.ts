import type { AffiliatedKeywords } from "uniorg"
import { toString } from "orgast-util-to-string"
import { renderInline, type Node } from "./render.js"

const MULTIPLE_RE = /^(?:CAPTION|HEADER|ATTR_.*)$/
// the keywords org reads with a dual value (`#+CAPTION[short]: long`);
// aliases (RESULT) are not
export const DUAL_NAMES = "CAPTION|RESULTS"
const DUAL_RE = new RegExp(`^(?:${DUAL_NAMES})$`)

/**
 * An element's affiliated keywords as key, value pairs, the way they are
 * written above it: several values (#+CAPTION, #+HEADER, #+ATTR_*) as
 * several pairs, parsed ones (#+CAPTION) as org text, a dual value as
 * part of the key (`CAPTION[short]`).
 * @param affiliated The element's affiliated keywords.
 * @param asOrg Parsed values as org text, links and markup kept, not as
 * plain text (a Markdown line above a body element reads markup anew).
 * @returns The pairs in order.
 */
export function affiliatedEntries(
  affiliated: AffiliatedKeywords = {},
  asOrg = false
): [string, string][] {
  return Object.entries(affiliated).flatMap(([key, value]) =>
    (MULTIPLE_RE.test(key) ? (value as unknown[]) : [value]).map(item => {
      const [main, dual] = DUAL_RE.test(key) && isDual(item) ? item : [item]
      return [
        dual === undefined ? key : `${key}[${dual}]`,
        asOrg ? orgText(main) : plainText(main)
      ] as [string, string]
    })
  )
}

function isDual(value: unknown): value is [unknown, string] {
  return (
    Array.isArray(value) && value.length === 2 && typeof value[1] === "string"
  )
}

function plainText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  return Array.isArray(value)
    ? value.map(plainText).join("")
    : toString(value as Parameters<typeof toString>[0])
}

function orgText(value: unknown): string {
  const items: unknown[] = Array.isArray(value) ? value : [value]
  return items
    .map(item => (typeof item === "string" ? item : renderInline(item as Node)))
    .join("")
}
