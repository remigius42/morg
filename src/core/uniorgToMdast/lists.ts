import type {
  BlockContent,
  DefinitionContent,
  List as MdastList,
  ListItem as MdastListItem,
  PhrasingContent,
  RootContent
} from "mdast"
import type { List, ListItem } from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import { htmlEnabled, type TransformContext } from "./shared.js"
import { transformNodes } from "./elements.js"

export function transformPlainList(
  ctx: TransformContext,
  node: List
): RootContent | RootContent[] {
  if (node.listType === "descriptive" && htmlEnabled(ctx, "descriptiveList")) {
    return descriptiveListToHtml(node)
  }
  return transformUniorgList(ctx, node)
}

// a descriptive list item starts with a list-item-tag (the term)
function listItemTag(item: ListItem): ListItem["children"][number] | undefined {
  return (item.children || []).find(
    child => (child as { type: string }).type === "list-item-tag"
  )
}

// with useHtml a descriptive list renders as a <dl> block (a preserved
// md-ism on the return trip); terms and definitions are flattened to text
function descriptiveListToHtml(node: List): RootContent {
  const lines = ["<dl>"]
  for (const item of node.children || []) {
    if (item.type !== "list-item") {
      continue
    }
    const tag = listItemTag(item)
    const definition = (item.children || []).filter(child => child !== tag)
    lines.push(`<dt>${tag ? orgastToString(tag).trim() : ""}</dt>`)
    lines.push(
      `<dd>${definition
        .map(child => orgastToString(child))
        .join("")
        .trim()}</dd>`
    )
  }
  lines.push("</dl>")
  return { type: "html", value: lines.join("\n") }
}

// A single blank line does not end a list in org, so one uniorg plain-list
// can mix ordered and unordered bullets. Markdown cannot: split the items
// into runs by bullet kind, one mdast list per run.
function transformUniorgList(ctx: TransformContext, node: List): MdastList[] {
  const items = (node.children || []).filter(
    (child): child is ListItem => child.type === "list-item"
  )
  const runs: ListItem[][] = []
  let previousOrdered: boolean | undefined
  for (const item of items) {
    const ordered = /^\d/.test(item.bullet)
    if (ordered === previousOrdered) {
      runs[runs.length - 1]?.push(item)
    } else {
      runs.push([item])
      previousOrdered = ordered
    }
  }
  return runs.map(run => {
    const firstBullet = run[0]?.bullet ?? "- "
    const ordered = /^\d/.test(firstBullet)
    return {
      type: "list",
      ordered,
      start: ordered ? parseInt(firstBullet, 10) || 1 : null,
      spread: false,
      children: run.map(item => transformUniorgListItem(ctx, item))
    }
  })
}

function transformUniorgListItem(
  ctx: TransformContext,
  item: ListItem
): MdastListItem {
  // md has no descriptive lists, so keep the ` :: ` syntax literally in the
  // item text — the return trip re-parses it as a descriptive list
  const tag = listItemTag(item)
  const children = transformNodes(
    ctx,
    (item.children || []).filter(child => child !== tag)
  ) as (BlockContent | DefinitionContent)[]
  if (tag) {
    const term: PhrasingContent = {
      type: "text",
      value: `${orgastToString(tag)} :: `
    }
    const first = children[0]
    if (first?.type === "paragraph") {
      first.children.unshift(term)
    } else {
      children.unshift({ type: "paragraph", children: [term] })
    }
  }
  return {
    type: "listItem",
    spread: false,
    checked:
      item.checkbox === "on" ? true : item.checkbox === "off" ? false : null,
    children
  }
}
