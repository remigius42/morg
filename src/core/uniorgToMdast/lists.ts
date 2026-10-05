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
import { DESCRIPTIVE_LIST_MARKER } from "../descriptiveTags.js"
import { transformNodes } from "./elements.js"
import { transformUniorgObjects } from "./objects.js"
import type { DefListNode } from "mdast-util-definition-list"

export function transformPlainList(
  ctx: TransformContext,
  node: List
): RootContent | RootContent[] {
  const items = listItems(node)
  // uniorg reads a numbered list with terms as descriptive; Emacs reads
  // it as numbered
  if (node.listType === "descriptive" && !/^\d/.test(items[0]?.bullet ?? "")) {
    if (htmlEnabled(ctx, "definitionList")) {
      return descriptiveListToHtml(node)
    }
    // a definition list has no entry without a term, nor a checkbox
    if (items.every(item => listItemTag(item) && !item.checkbox)) {
      return descriptiveListToDefList(ctx, items)
    }
  }
  return transformUniorgList(ctx, node)
}

// a descriptive list item starts with a list-item-tag (the term)
function listItemTag(item: ListItem): ListItem["children"][number] | undefined {
  return (item.children || []).find(
    child => (child as { type: string }).type === "list-item-tag"
  )
}

// an <img> line below text would be part of the paragraph: the item
// or definition takes blank lines between its blocks
function imgBelow(blocks: (BlockContent | DefinitionContent)[]): boolean {
  return blocks.some(
    (block, i) =>
      i > 0 && block.type === "html" && block.value.startsWith("<img")
  )
}

function listItems(node: List): ListItem[] {
  return (node.children || []).filter(
    (child): child is ListItem => child.type === "list-item"
  )
}

// a descriptive list in its Markdown spelling (ADR 0007): a term per
// item, its content the description
function descriptiveListToDefList(
  ctx: TransformContext,
  items: ListItem[]
): RootContent {
  const children = items.flatMap((item): DefListNode["children"] => {
    const tag = listItemTag(item) as ListItem["children"][number] & {
      children: Parameters<typeof transformUniorgObjects>[1]
    }
    const blocks = itemBlocks(
      ctx,
      item,
      (item.children || []).filter(child => child !== tag)
    )
    return [
      {
        type: "defListTerm",
        children: transformUniorgObjects(ctx, tag.children)
      },
      { type: "defListDescription", spread: imgBelow(blocks), children: blocks }
    ]
  })
  return { type: "defList", children } as unknown as RootContent
}

// `&`, `<` and `>` in the text would otherwise produce invalid html that
// interpretDefinitionList cannot read back; decoded again on that side
function escapeHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

// spelled in html a descriptive list renders as a <dl> block (a preserved
// md-ism on the return trip); terms and definitions are flattened to text
function descriptiveListToHtml(node: List): RootContent {
  const lines = ["<dl>"]
  for (const item of node.children || []) {
    if (item.type !== "list-item") {
      continue
    }
    const tag = listItemTag(item)
    const definition = (item.children || []).filter(child => child !== tag)
    lines.push(
      `<dt>${escapeHtmlText(tag ? orgastToString(tag).trim() : "")}</dt>`
    )
    lines.push(
      `<dd>${escapeHtmlText(
        definition
          .map(child => orgastToString(child))
          .join("")
          .trim()
      )}</dd>`
    )
  }
  lines.push("</dl>")
  return { type: "html", value: lines.join("\n") }
}

// A single blank line does not end a list in org, so one uniorg plain-list
// can mix ordered and unordered bullets. Markdown cannot: split the items
// into runs by bullet kind, one mdast list per run.
function transformUniorgList(ctx: TransformContext, node: List): RootContent[] {
  const items = listItems(node)
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
  return runs.flatMap((run): RootContent[] => {
    const firstBullet = run[0]?.bullet ?? "- "
    const ordered = /^\d/.test(firstBullet)
    const list: MdastList = {
      type: "list",
      ordered,
      start: ordered ? parseInt(firstBullet, 10) : null,
      spread: false,
      children: run.map(item => transformUniorgListItem(ctx, item))
    }
    // a run with a term keeps its ` :: ` text below the marker, which
    // tells md→org the terms are org's (ADR 0007 §3)
    return run.some(listItemTag)
      ? [{ type: "html", value: `<!-- ${DESCRIPTIVE_LIST_MARKER} -->` }, list]
      : [list]
  })
}

// uniorg keeps a list item's indentation in its code blocks' values;
// md indents them itself. Only that much is dropped, as uniorg-stringify
// does, so the code keeps its own
function outdent(value: string, level: number): string {
  return value.replace(new RegExp(`^ {0,${level}}`, "gm"), "")
}

// an item's content as Markdown blocks, its code without the item's indentation
function itemBlocks(
  ctx: TransformContext,
  item: ListItem,
  content: ListItem["children"]
): (BlockContent | DefinitionContent)[] {
  const blocks = transformNodes(ctx, content) as (
    BlockContent | DefinitionContent
  )[]
  for (const block of blocks) {
    if (block.type === "code") {
      block.value = outdent(block.value, item.indent + item.bullet.length)
    }
  }
  return blocks
}

function transformUniorgListItem(
  ctx: TransformContext,
  item: ListItem
): MdastListItem {
  // a term no definition list holds stays ` :: ` text in the item,
  // which the return trip reads as a term below the marker only
  const tag = listItemTag(item)
  const children = itemBlocks(
    ctx,
    item,
    (item.children || []).filter(child => child !== tag)
  )
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
  keepLeadingColon(children[0])
  return {
    type: "listItem",
    spread: imgBelow(children),
    checked:
      item.checkbox === "on" ? true : item.checkbox === "off" ? false : null,
    children
  }
}

// a `: ` line below text starts a definition, which the stringifier
// escapes (`\:`); an item's first line has no text above it, so its
// colon goes unescaped, as MDN's `- : definition` items are written
function keepLeadingColon(
  first: BlockContent | DefinitionContent | undefined
): void {
  if (first?.type !== "paragraph") {
    return
  }
  const text = first.children[0]
  if (text?.type === "text" && /^:(?=[ \t]|$)/.test(text.value)) {
    text.value = text.value.slice(1)
    first.children.unshift({
      type: "verbatimInline",
      value: ":"
    } as unknown as PhrasingContent)
  }
}
