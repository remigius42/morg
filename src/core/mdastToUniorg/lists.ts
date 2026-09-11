import type { List as MdastList, ListItem as MdastListItem } from "mdast"
import type {
  Text,
  ElementType,
  GreaterElementType,
  ObjectType,
  List,
  ListItem
} from "uniorg"
import type { TransformContext } from "./context.js"
import { transformPhrasingChildren } from "./phrasing.js"
// circular import with index.js is fine in ESM: both sides only export
// hoisted function declarations called after module initialization
import { transformMdastNodeToUniorgNode } from "./index.js"

// Mirrors the AST shape uniorg-parse produces for lists: ordered numbering
// lives in each item's bullet, and nested lists sit inside the parent
// item's children with indent = parent indent + bullet length.
export function transformMdastList(
  ctx: TransformContext,
  listNode: MdastList,
  indent: number
): List {
  const start = listNode.start ?? 1
  return {
    type: "plain-list",
    listType: listNode.ordered ? "ordered" : "unordered",
    indent,
    affiliated: {},
    children: listNode.children.map((item, i) =>
      transformMdastListItem(
        ctx,
        item,
        indent,
        listNode.ordered ? `${start + i}. ` : "- "
      )
    ),
    contentsBegin: 0,
    contentsEnd: 0
  } as unknown as List
}

function transformMdastListItem(
  ctx: TransformContext,
  item: MdastListItem,
  indent: number,
  bullet: string
): ListItem {
  // Paragraph content is flattened to inline objects: uniorg-stringify's
  // paragraph handler appends a separating blank line, which is wrong
  // inside a list item.
  type ItemChild = GreaterElementType | ElementType | Text | ObjectType | null
  const children = item.children
    .flatMap((child): ItemChild[] => {
      if (child.type === "list") {
        return [transformMdastList(ctx, child, indent + bullet.length)]
      }
      if (child.type === "paragraph") {
        return [
          ...transformPhrasingChildren(ctx, child.children),
          { type: "text", value: "\n" }
        ]
      }
      return [transformMdastNodeToUniorgNode(ctx, child)]
    })
    .filter(Boolean)
  return {
    type: "list-item",
    indent,
    bullet,
    counter: null,
    checkbox:
      item.checked === true ? "on" : item.checked === false ? "off" : null,
    children,
    contentsBegin: 0,
    contentsEnd: 0
  } as unknown as ListItem
}
