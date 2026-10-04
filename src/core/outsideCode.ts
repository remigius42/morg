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

/**
 * A Markdown string with its code, math, frontmatter and raw HTML
 * blanked out (NUL characters, one per character), so a scan for syntax
 * finds it outside them only, at the offsets it has in the string.
 * @param markdown The Markdown string.
 * @returns The masked string, as long as the input.
 */
export function maskCode(markdown: string): string {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .parse(markdown)
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
 * Maps a Markdown string's text, each stretch between code, math,
 * frontmatter and raw HTML on its own, leaving those as written.
 * @param markdown The Markdown string.
 * @param map What a stretch of text becomes.
 * @returns The mapped Markdown string.
 */
export function mapOutsideCode(
  markdown: string,
  map: (text: string) => string
): string {
  return [...maskCode(markdown).matchAll(/\0+|[^\0]+/g)]
    .map(({ 0: run, index }) => {
      const text = markdown.slice(index, index + run.length)
      return run.startsWith("\0") ? text : map(text)
    })
    .join("")
}
