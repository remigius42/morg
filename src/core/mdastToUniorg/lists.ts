import type { List as MdastList, ListItem as MdastListItem } from "mdast"
import type {
  Text,
  ElementType,
  GreaterElementType,
  ObjectType,
  List,
  ListItem
} from "uniorg"
import { warn, type TransformContext } from "./context.js"
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

// uniorg-stringify re-indents a list item's block by stripping up to
// the item's indentation from each line first: a code block's value
// has to carry that indentation (as uniorg's parser reads it), or its
// own indentation shrinks
function indentCode<T>(node: T, level: number): T {
  const block = node as { type?: string; value?: string } | null
  if (
    (block?.type === "src-block" || block?.type === "example-block") &&
    block.value !== undefined
  ) {
    block.value = block.value.replace(/^(?=.)/gm, " ".repeat(level))
  }
  return node
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
      if (child.type === "heading") {
        // org headlines cannot live inside a list item; the text stays
        warn(ctx, "heading inside a list item became text")
      }
      if (child.type === "paragraph" || child.type === "heading") {
        return [
          ...transformPhrasingChildren(ctx, child.children),
          { type: "text", value: "\n" }
        ]
      }
      return [
        indentCode(
          transformMdastNodeToUniorgNode(ctx, child),
          indent + bullet.length
        )
      ]
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
