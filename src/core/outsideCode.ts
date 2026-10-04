import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import type { Node, Parent } from "unist"

// what holds no Markdown text: code, math, frontmatter and raw HTML
const VERBATIM = new Set([
  "code",
  "inlineCode",
  "math",
  "inlineMath",
  "yaml",
  "html"
])

function verbatimRanges(node: Node, ranges: [number, number][]): void {
  if (VERBATIM.has(node.type)) {
    ranges.push([
      node.position?.start.offset ?? 0,
      node.position?.end.offset ?? 0
    ])
    return
  }
  for (const child of (node as Partial<Parent>).children ?? []) {
    verbatimRanges(child, ranges)
  }
}

function parse(markdown: string): Node {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .parse(markdown)
}

function mask(markdown: string, tree: Node): string {
  const ranges: [number, number][] = []
  verbatimRanges(tree, ranges)
  let masked = ""
  let from = 0
  for (const [start, end] of ranges) {
    masked += markdown.slice(from, start) + "\0".repeat(end - start)
    from = end
  }
  return masked + markdown.slice(from)
}

/**
 * A Markdown string with its code, math, frontmatter and raw HTML
 * blanked out (NUL characters, one per character), so a scan for syntax
 * finds it outside them only, at the offsets it has in the string.
 * @param markdown The Markdown string.
 * @returns The masked string, as long as the input.
 */
export function maskCode(markdown: string): string {
  return mask(markdown, parse(markdown))
}

function tableRanges(node: Node, ranges: [number, number][]): void {
  if (node.type === "table") {
    ranges.push([
      node.position?.start.offset ?? 0,
      node.position?.end.offset ?? 0
    ])
    return
  }
  for (const child of (node as Partial<Parent>).children ?? []) {
    tableRanges(child, ranges)
  }
}

/**
 * Maps a Markdown string's text, each stretch between code, math,
 * frontmatter and raw HTML on its own, leaving those as written; a
 * stretch ends where a table starts or ends too.
 * @param markdown The Markdown string.
 * @param map What a stretch of text becomes, told if it is in a table.
 * @returns The mapped Markdown string.
 */
export function mapOutsideCode(
  markdown: string,
  map: (text: string, inTable: boolean) => string
): string {
  const tree = parse(markdown)
  const tables: [number, number][] = []
  tableRanges(tree, tables)
  const bounds = tables.flat()
  return [...mask(markdown, tree).matchAll(/\0+|[^\0]+/g)]
    .map(({ 0: run, index }) => {
      const end = index + run.length
      if (run.startsWith("\0")) {
        return markdown.slice(index, end)
      }
      const cuts = [index, ...bounds.filter(b => b > index && b < end), end]
      return cuts
        .slice(1)
        .map((to, i) => {
          const from = cuts[i] ?? index
          const inTable = tables.some(([s, e]) => from >= s && from < e)
          return map(markdown.slice(from, to), inTable)
        })
        .join("")
    })
    .join("")
}
