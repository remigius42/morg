import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  List as MdastList,
  ListItem as MdastListItem
} from "mdast"
import type {
  OrgData,
  Paragraph,
  Text,
  ElementType,
  GreaterElementType,
  ObjectType,
  List,
  ListItem
} from "uniorg"
import { toString } from "orgast-util-to-string"

/**
 * Transforms a mdast (Markdown AST) to a uniorg AST.
 * @param mdast The mdast tree to transform.
 * @returns The transformed uniorg AST.
 */
export function transformMdastToUniorgAst(mdast: MdastRoot): OrgData {
  const children: (GreaterElementType | ElementType)[] = mdast.children
    .map(transformMdastNodeToUniorgNode)
    .filter(Boolean) as (GreaterElementType | ElementType)[]

  const orgAst: OrgData = {
    type: "org-data",
    children: children,
    contentsBegin: 0, // Placeholder
    contentsEnd: 0 // Placeholder
  }

  return orgAst
}

function transformMdastPhrasingContentToUniorgObject(
  node: PhrasingContent
): ObjectType | null {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value }
    case "emphasis":
      return {
        type: "italic",
        children: node.children
          .map(transformMdastPhrasingContentToUniorgObject)
          .filter(Boolean) as ObjectType[]
      }
    case "strong":
      return {
        type: "bold",
        children: node.children
          .map(transformMdastPhrasingContentToUniorgObject)
          .filter(Boolean) as ObjectType[]
      }
    case "link": {
      const linkNode = node
      const linkChildren = linkNode.children
        .map(transformMdastPhrasingContentToUniorgObject)
        .filter(Boolean) as ObjectType[]
      // rawLink should just be the URL, uniorg-stringify adds the brackets
      return {
        type: "link",
        format: "bracket", // Assuming bracket format for Markdown links
        linkType: "url",
        rawLink: linkNode.url,
        path: linkNode.url,
        children: linkChildren
      }
    }
    // TODO: Add handlers for other mdast phrasing content types (image, inlineCode, etc.)
    default:
      return null
  }
}

function transformMdastNodeToUniorgNode(
  node: RootContent | PhrasingContent
): GreaterElementType | ElementType | Text | null {
  switch (node.type) {
    case "heading":
      return {
        type: "headline",
        level: node.depth,
        todoKeyword: null,
        priority: null,
        commented: false,
        rawValue: toString(node),
        tags: [],
        children: node.children
          .map(transformMdastPhrasingContentToUniorgObject)
          .filter(Boolean) as ObjectType[]
      }
    case "paragraph":
      return {
        type: "paragraph",
        children: node.children
          .map(transformMdastPhrasingContentToUniorgObject)
          .filter(Boolean) as ObjectType[],
        contentsBegin: 0, // Placeholder
        contentsEnd: 0 // Placeholder
      } as Paragraph
    case "text":
      return { type: "text", value: node.value }
    case "list":
      return transformMdastList(node, 0)
    // TODO: Add handlers for other mdast node types (blockquote, code, thematicBreak, etc.)
    default:
      return null
  }
}

// Mirrors the AST shape uniorg-parse produces for lists: ordered numbering
// lives in each item's bullet, and nested lists sit inside the parent
// item's children with indent = parent indent + bullet length.
function transformMdastList(listNode: MdastList, indent: number): List {
  const start = listNode.start ?? 1
  return {
    type: "plain-list",
    listType: listNode.ordered ? "ordered" : "unordered",
    indent,
    affiliated: {},
    children: listNode.children.map((item, i) =>
      transformMdastListItem(
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
        return [transformMdastList(child, indent + bullet.length)]
      }
      if (child.type === "paragraph") {
        return [
          ...(child.children
            .map(transformMdastPhrasingContentToUniorgObject)
            .filter(Boolean) as ObjectType[]),
          { type: "text", value: "\n" }
        ]
      }
      return [transformMdastNodeToUniorgNode(child)]
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
