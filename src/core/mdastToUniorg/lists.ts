import type {
  BlockContent,
  DefinitionContent,
  List as MdastList,
  ListItem as MdastListItem
} from "mdast"
import type {
  DefListDescriptionNode,
  DefListNode,
  DefListTermNode
} from "mdast-util-definition-list"
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
      if (child.type === "defList") {
        return [transformMdastDefList(ctx, child, indent + bullet.length)]
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

/**
 * The text between a descriptive item's term and its definition, which
 * org re-parses as the tag; escapeDescriptiveTags leaves what it ends
 * alone. A text node rather than uniorg's list-item-tag, whose
 * stringifier splits a term at its first object.
 */
export function tagSeparator(blockFollows: boolean): Text {
  return {
    type: "text",
    value: blockFollows ? " ::\n" : " :: ",
    tagSeparator: true
  } as Text
}

interface DefListEntry {
  terms: DefListTermNode[]
  descriptions: DefListDescriptionNode[]
}

// a run of terms and the descriptions that follow them
function defListEntries(node: DefListNode): DefListEntry[] {
  const entries: DefListEntry[] = []
  for (const child of node.children) {
    const last = entries.at(-1)
    if (child.type === "defListDescription") {
      last?.descriptions.push(child)
    } else if (last && !last.descriptions.length) {
      last.terms.push(child)
    } else {
      entries.push({ terms: [child], descriptions: [] })
    }
  }
  return entries
}

/**
 * A definition list becomes an org descriptive list (ADR 0007): an item
 * per term, its definition the item's content. Org has one definition
 * per term, so several merge into one, and a term without its own
 * definition, one of several above a definition, gets an empty one.
 * @param ctx The transform context.
 * @param node The definition list.
 * @param indent The list's indentation.
 * @returns The descriptive list.
 */
export function transformMdastDefList(
  ctx: TransformContext,
  node: DefListNode,
  indent: number
): List {
  const items = defListEntries(node).flatMap(({ terms, descriptions }) => {
    if (terms.length > 1) {
      warn(
        ctx,
        "a definition list term without its own definition got an empty one"
      )
    }
    if (descriptions.length > 1) {
      warn(ctx, "a definition list term's definitions were merged into one")
    }
    const blocks = descriptions.flatMap(description => description.children)
    return terms.map((term, i) =>
      descriptiveItem(ctx, term, i === terms.length - 1 ? blocks : [], indent)
    )
  })
  return {
    type: "plain-list",
    listType: "descriptive",
    indent,
    affiliated: {},
    children: items,
    contentsBegin: 0,
    contentsEnd: 0
  } as unknown as List
}

function descriptiveItem(
  ctx: TransformContext,
  term: DefListTermNode,
  blocks: (BlockContent | DefinitionContent)[],
  indent: number
): ListItem {
  const item = transformMdastListItem(
    ctx,
    { type: "listItem", spread: false, children: blocks },
    indent,
    "- "
  )
  // an item's children are inline objects too, as transformMdastListItem
  // flattens its paragraphs
  ;(item.children as unknown[]).unshift(
    ...transformPhrasingChildren(ctx, term.children),
    tagSeparator(blocks[0]?.type !== "paragraph")
  )
  return item
}
