import type { List as MdastList, Root as MdastRoot, RootContent } from "mdast"
import type { Keyword, OrgData } from "uniorg"
import { stringify as stringifyYaml } from "yaml"
import {
  warn,
  type TransformContext,
  type UniorgToMdastOptions
} from "./shared.js"
import {
  isModeLineComment,
  takeFileHeader,
  takeRenderedFileHeader
} from "../frontmatterBlock.js"
import { collectFootnoteLabels } from "./footnotes.js"
import { orgAnchors } from "../internalLinks.js"
import { transformNodes } from "./elements.js"

export type { UniorgToMdastOptions } from "./shared.js"

/**
 * Transforms a uniorg AST to a mdast (Markdown AST).
 * @param uniorgAst The uniorg AST to transform.
 * @param options Controls org-ism serialization (`key:: value` lines);
 * `org`, the text a tree was parsed from, finds its frontmatter block.
 * @returns The transformed mdast.
 */
export function transformUniorgAstToMdast(
  uniorgAst: OrgData,
  options: UniorgToMdastOptions = {}
): MdastRoot {
  // called on its own, not by convertOrgToMarkdown, which takes the
  // header off the org text: the header of the org text the tree was
  // parsed from, or else the one transformMdastToUniorgAst built, from a
  // copy, so the caller's tree stays as it is
  if (options.takesMorgEntries === undefined) {
    uniorgAst = { ...uniorgAst, children: [...uniorgAst.children] }
    const header =
      options.org === undefined
        ? takeRenderedFileHeader(uniorgAst)
        : takeFileHeader(uniorgAst, options.org, options.onWarning)
    options = { ...options, ...header }
  }
  const ctx: TransformContext = {
    options,
    inlineFootnotes: [],
    usedFootnoteLabels: new Set(),
    anchors: orgAnchors(uniorgAst)
  }
  collectFootnoteLabels(ctx, uniorgAst)
  const nodes = uniorgAst.children || []
  const { yaml, rest } = takeFrontmatter(ctx, nodes)
  const children: RootContent[] = transformNodes(ctx, rest)
  // adjacent single-item task lists (one per converted TODO section)
  // merge into one list, or the output would not be a fixed point
  if (options.taskCheckboxes) {
    mergeAdjacentTaskLists(children)
  }
  if (yaml !== undefined) {
    children.unshift({ type: "yaml", value: yaml })
  }
  for (const footnote of ctx.inlineFootnotes) {
    children.push({
      type: "footnoteDefinition",
      identifier: footnote.label,
      label: footnote.label,
      children: [{ type: "paragraph", children: footnote.children }]
    })
  }
  return { type: "root", children: children }
}

// the frontmatter: the block's YAML, and the leading #+KEY: value
// keywords, which can act in Emacs, in order, repeats included, as
// morg's own entry (ADR 0005); where they cannot join it, they stay
// keyword lines. Returns the YAML and the nodes left
function takeFrontmatter(
  ctx: TransformContext,
  nodes: OrgData["children"]
): { yaml: string | undefined; rest: OrgData["children"] } {
  const block = ctx.options.frontmatter
  // set by the caller or transformUniorgAstToMdast, never undefined
  const joins = ctx.options.takesMorgEntries === true
  const start = leadingKeywordsStart(nodes)
  warnAboutFrontmatter(ctx, block, joins ? [] : nodes.slice(start))
  const keywords = inertModeLineGuard(
    ctx,
    nodes,
    joins ? leadingKeywords(nodes.slice(start)) : [],
    start
  )
  const entries = morgEntries(ctx.options.fileProperties ?? [], keywords)
  const rest = [
    ...nodes.slice(0, start),
    ...nodes.slice(start + keywords.length)
  ]
  // an empty block adds nothing next to the entries
  // on a line of their own: a keep-chomped (`|+`) scalar at the end of
  // the block holds a newline already there
  const yaml =
    entries && block
      ? `${block.replace(/(?<!\n)$/, "\n")}${entries}`
      : (entries ?? block)
  // leading the Markdown body, with or without frontmatter above it
  if (isInertModeLine(ctx, rest[0])) {
    warn(ctx, "a -*- comment below the first line becomes the mode line in org")
  }
  return { yaml, rest }
}

// leading keywords may sit below a -*- comment, which leads the
// Markdown body and so becomes the mode line (warned if it was none);
// below another comment, they would come back above it
function leadingKeywordsStart(nodes: OrgData["children"]): number {
  return nodes[0] && isModeLineComment(nodes[0]) ? 1 : 0
}

// a -*- comment below the file's first line, which Emacs ignores
function isInertModeLine(
  ctx: TransformContext,
  node: { type: string } | undefined
): boolean {
  return !ctx.options.startsWithModeLine && !!node && isModeLineComment(node)
}

// md→org makes a -*- comment that leads the Markdown body the file's
// mode line: leading keywords directly above one stay lines, so it
// does not lead it
function inertModeLineGuard(
  ctx: TransformContext,
  nodes: OrgData["children"],
  keywords: [string, string][],
  start: number
): [string, string][] {
  if (
    !keywords.length ||
    start !== 0 ||
    !isInertModeLine(ctx, nodes[keywords.length])
  ) {
    return keywords
  }
  warn(
    ctx,
    "leading keywords stay lines: a -*- comment below them is no mode line"
  )
  return []
}

function leadingKeywords(nodes: OrgData["children"]): [string, string][] {
  const keywords: [string, string][] = []
  while (nodes[keywords.length]?.type === "keyword") {
    const keyword = nodes[keywords.length] as unknown as Keyword
    keywords.push([keyword.key, keyword.value])
  }
  return keywords
}

// morg's own entries as YAML text, or undefined without any
function morgEntries(
  fileProperties: [string, string][],
  keywords: [string, string][]
): string | undefined {
  // an empty value as `KEY:`, as it reads back, not as `KEY: ""`
  const items = (pairs: [string, string][]): Record<string, string | null>[] =>
    pairs.map(([key, value]) => ({ [key]: value || null }))
  const entries = {
    ...(fileProperties.length && { morg_properties: items(fileProperties) }),
    ...(keywords.length && { morg_keywords: items(keywords) })
  }
  // unfolded: a value folded over lines fits no keyword line again
  return Object.keys(entries).length
    ? stringifyYaml(entries, { lineWidth: 0, nullStr: "" }).trimEnd()
    : undefined
}

// `left`: the leading nodes the frontmatter could not take
function warnAboutFrontmatter(
  ctx: TransformContext,
  block: string | undefined,
  left: OrgData["children"]
): void {
  if (block && /^---[ \t]*$/m.test(block)) {
    warn(ctx, "frontmatter holds a --- line, which ends it early in Markdown")
  }
  const drawer = left[0]?.type === "property-drawer"
  if (drawer) {
    warn(ctx, "file-level drawer stays text: the frontmatter cannot take it")
  }
  if (left[drawer ? 1 : 0]?.type === "keyword") {
    warn(ctx, "leading keywords stay lines: the frontmatter cannot take them")
  }
}

function isTaskList(node: RootContent | undefined): node is MdastList {
  return (
    node?.type === "list" &&
    !node.ordered &&
    node.children.every(item => item.checked !== null)
  )
}

function mergeAdjacentTaskLists(children: RootContent[]): void {
  for (let i = 0; i < children.length - 1;) {
    const current = children[i]
    const next = children[i + 1]
    if (isTaskList(current) && isTaskList(next)) {
      current.children.push(...next.children)
      children.splice(i + 1, 1)
    } else {
      i++
    }
  }
}
