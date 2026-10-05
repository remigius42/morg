import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMath from "remark-math"
import { remarkDefinitionList } from "remark-definition-list"
import type { Code, Emphasis, List, Root, Strong, ThematicBreak } from "mdast"
import { visit } from "unist-util-visit"
import type { MarkdownStyleOptions } from "../options.js"
import { applyEdits, type Edit } from "./edits.js"

function offsets(node: {
  position?: { start: { offset?: number }; end: { offset?: number } }
}): [number, number] {
  return [node.position?.start.offset ?? 0, node.position?.end.offset ?? 0]
}

function bulletEdits(tree: Root, bullet: string): Edit[] {
  const edits: Edit[] = []
  visit(tree, "list", (list: List) => {
    if (list.ordered) {
      return
    }
    for (const item of list.children) {
      const [start] = offsets(item)
      edits.push([start, start + 1, bullet])
    }
  })
  return edits
}

// `_` closes no emphasis within a word
function inWord(markdown: string, start: number, end: number): boolean {
  return /\w/.test(markdown[start - 1] ?? "") || /\w/.test(markdown[end] ?? "")
}

function delimiterEdits(
  tree: Root,
  markdown: string,
  type: "emphasis" | "strong",
  marker: string
): Edit[] {
  const width = type === "strong" ? 2 : 1
  const edits: Edit[] = []
  visit(tree, type, (node: Emphasis | Strong) => {
    const [start, end] = offsets(node)
    if (
      markdown[start] === marker ||
      (marker === "_" && inWord(markdown, start, end))
    ) {
      return
    }
    const markers = marker.repeat(width)
    edits.push([start, start + width, markers], [end - width, end, markers])
  })
  return edits
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

// a fenced block's opening and closing fence, unless its code holds a
// run of the new marker, which could close it
function fenceEdits(tree: Root, markdown: string, fence: string): Edit[] {
  const edits: Edit[] = []
  visit(tree, "code", (node: Code) => {
    const [start, end] = offsets(node)
    const source = markdown.slice(start, end)
    const run = FENCE_RE.exec(source)?.[1]
    if (!run || run[0] === fence || node.value.includes(fence.repeat(3))) {
      return
    }
    const markers = fence.repeat(run.length)
    const open = start + source.indexOf(run)
    edits.push([open, open + run.length, markers])
    // the closing fence may be longer, and missing at the document's end
    const last = source.lastIndexOf("\n") + 1
    const closing = /^ *([`~]+) *$/.exec(source.slice(last))
    if (last && closing?.[1]) {
      const at = start + last + source.slice(last).indexOf(closing[1])
      edits.push([at, at + closing[1].length, fence.repeat(closing[1].length)])
    }
  })
  return edits
}

// a thematic break, as long as it was unless the style says how long
function ruleEdits(
  tree: Root,
  markdown: string,
  { rule, ruleRepetition }: MarkdownStyleOptions
): Edit[] {
  const edits: Edit[] = []
  visit(tree, "thematicBreak", (node: ThematicBreak) => {
    const [start, end] = offsets(node)
    const source = markdown.slice(start, end).trim()
    const marker = rule ?? source[0] ?? "-"
    const count = ruleRepetition ?? source.replace(/\s/g, "").length
    edits.push([start, end, marker.repeat(Math.max(3, count))])
  })
  return edits
}

/**
 * Rewrites the markers a style names, and nothing else: the rest of the
 * Markdown stays as written, where a stringifier would canonicalize it.
 * @param markdown The Markdown string.
 * @param style The markers to write.
 * @returns The Markdown string with those markers.
 */
export function restyleMarkdown(
  markdown: string,
  style: MarkdownStyleOptions
): string {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter)
    .use(remarkMath)
    .use(remarkDefinitionList)
    .parse(markdown)
  const edits = [
    ...(style.bullet ? bulletEdits(tree, style.bullet) : []),
    ...(style.emphasis
      ? delimiterEdits(tree, markdown, "emphasis", style.emphasis)
      : []),
    ...(style.strong
      ? delimiterEdits(tree, markdown, "strong", style.strong)
      : []),
    ...(style.fence ? fenceEdits(tree, markdown, style.fence) : []),
    ...(style.rule || style.ruleRepetition
      ? ruleEdits(tree, markdown, style)
      : [])
  ]
  return applyEdits(markdown, edits)
}
