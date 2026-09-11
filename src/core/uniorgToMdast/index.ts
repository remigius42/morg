import type { List as MdastList, Root as MdastRoot, RootContent } from "mdast"
import type { OrgData } from "uniorg"
import { stringify as stringifyYaml } from "yaml"
import type { TransformContext, UniorgToMdastOptions } from "./shared.js"
import { collectFootnoteLabels } from "./footnotes.js"
import { transformNodes } from "./elements.js"

export type { UniorgToMdastOptions } from "./shared.js"

/**
 * Transforms a uniorg AST to a mdast (Markdown AST).
 * @param uniorgAst The uniorg AST to transform.
 * @param options Controls org-ism serialization (`key:: value` lines).
 * @returns The transformed mdast.
 */
export function transformUniorgAstToMdast(
  uniorgAst: OrgData,
  options: UniorgToMdastOptions = {}
): MdastRoot {
  const ctx: TransformContext = {
    options,
    inlineFootnotes: [],
    usedFootnoteLabels: new Set()
  }
  collectFootnoteLabels(ctx, uniorgAst)
  const nodes = uniorgAst.children || []
  // leading #+KEY: value keywords map to md frontmatter, a native
  // construct; JSON-encoded values restore their structure (ADR 0002)
  const frontmatter: Record<string, unknown> = {}
  let first = 0
  while (nodes[first]?.type === "keyword") {
    const keyword = nodes[first] as unknown as { key: string; value: string }
    frontmatter[keyword.key.toLowerCase()] = parseKeywordValue(keyword.value)
    first++
  }
  const children: RootContent[] = transformNodes(ctx, nodes.slice(first))
  // adjacent single-item task lists (one per converted TODO section)
  // merge into one list, or the output would not be a fixed point
  if (options.taskCheckboxes) {
    mergeAdjacentTaskLists(children)
  }
  if (first > 0) {
    children.unshift({
      type: "yaml",
      value: stringifyYaml(frontmatter).trimEnd()
    })
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

function parseKeywordValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
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
