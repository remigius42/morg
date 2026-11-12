import { unified, type Plugin } from "unified"
import type { OrgData } from "uniorg"
import uniorgParse from "uniorg-parse"
import { freeMark } from "./marks.js"

// ====================================================================
// WORKAROUND for a bug in uniorg-parse 3.2.2 (upstream issue: not filed
// yet, see TODO.md). Drop this module once a fixed version is in, and
// use uniorg-parse itself again; the canary in
// tests/uniorgWorkarounds.spec.ts fails then.
// ====================================================================
// Its `parseLineBreak` steps back a character to look before the `\\`
// and never forward again: on a line holding just the line break, that
// is the line break before it, so the parse makes no progress and
// throws. A mark in front of the `\\` gives it a character to step back
// to. Every org parse goes through this plugin, which takes the marks
// out of the tree again: from its strings, and from its offsets and
// columns, which then point into the text as given

// at any line's start: at the text's, uniorg reads two backslashes
const LINE_BREAK_LINE_RE = /^(?=\\\\[ \t]*$)/gm
const OFFSET_KEYS = new Set(["begin", "end", "contentsBegin", "contentsEnd"])

interface Guard {
  mark: string
  // the marks' offsets in the guarded text, ascending
  offsets: number[]
  // the guarded lines, 1-based
  lines: Set<number>
}

function guard(org: string): { text: string; guard?: Guard } {
  if (!org.includes("\\\\")) {
    return { text: org }
  }
  const mark = freeMark(org)
  const offsets: number[] = []
  const lines = new Set<number>()
  let line = 1
  let last = 0
  const text = org.replace(LINE_BREAK_LINE_RE, (_, at: number) => {
    for (let i = last; i < at; i++) {
      if (org[i] === "\n") {
        line++
      }
    }
    last = at
    offsets.push(at + offsets.length)
    lines.add(line)
    return mark
  })
  return offsets.length ? { text, guard: { mark, offsets, lines } } : { text }
}

// the marks before a guarded offset
function marksBefore(offsets: number[], offset: number): number {
  let low = 0
  let high = offsets.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((offsets[middle] ?? 0) < offset) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

interface Point {
  line: number
  column: number
  offset?: number
}

function dropMarkFromPoint(point: Point, { offsets, lines }: Guard): void {
  if (point.offset !== undefined) {
    point.offset -= marksBefore(offsets, point.offset)
  }
  if (lines.has(point.line) && point.column > 1) {
    point.column--
  }
}

function dropMarksFromPosition(position: object, g: Guard): void {
  const { start, end } = position as { start?: Point; end?: Point }
  if (start) {
    dropMarkFromPoint(start, g)
  }
  if (end) {
    dropMarkFromPoint(end, g)
  }
}

function dropMarksFromRecord(record: Record<string, unknown>, g: Guard): void {
  for (const [key, field] of Object.entries(record)) {
    if (key === "position" && field && typeof field === "object") {
      dropMarksFromPosition(field, g)
    } else if (OFFSET_KEYS.has(key) && typeof field === "number") {
      record[key] = field - marksBefore(g.offsets, field)
    } else {
      record[key] = dropMarks(field, g)
    }
  }
}

function isMarkedText(value: unknown, g: Guard): boolean {
  const node = value as { type?: unknown; value?: unknown } | null
  return (
    node?.type === "text" &&
    typeof node.value === "string" &&
    node.value.includes(g.mark)
  )
}

function dropMarks(value: unknown, g: Guard): unknown {
  if (typeof value === "string") {
    return value.replaceAll(g.mark, "")
  }
  if (Array.isArray(value)) {
    // a text node that is just the mark goes too
    return value.flatMap(item => {
      const marked = isMarkedText(item, g)
      const dropped = dropMarks(item, g)
      return marked && (dropped as { value: string }).value === ""
        ? []
        : [dropped]
    })
  }
  if (value && typeof value === "object") {
    dropMarksFromRecord(value as Record<string, unknown>, g)
  }
  return value
}

type Options = Parameters<typeof uniorgParse>[0]

/**
 * unified plugin: uniorg-parse, on a line of just a line break too; the
 * tree's offsets point into the text as given.
 */
export const orgParse: Plugin<[Options?], string, OrgData> = function (
  options
) {
  const parser = unified().use(uniorgParse, options).freeze()
  this.parser = (document: string) => {
    const { text, guard: g } = guard(document)
    const tree = parser.parse(text)
    return g ? (dropMarks(tree, g) as OrgData) : tree
  }
}
