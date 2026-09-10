import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  List as MdastList,
  ListItem as MdastListItem,
  TableRow as MdastTableRow
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
import { toggleEnabled, type Toggle } from "../options.js"

export interface MdastToUniorgOptions {
  preserveMdisms?: Toggle
}

// options for the current transformMdastToUniorgAst run; the transform is
// synchronous, so module state is safe and avoids threading the options
// through every recursive call site
let currentOptions: MdastToUniorgOptions = {}

function mdismEnabled(key: string): boolean {
  return toggleEnabled(currentOptions.preserveMdisms, key)
}

/**
 * Transforms a mdast (Markdown AST) to a uniorg AST.
 * @param mdast The mdast tree to transform.
 * @param options Controls md-ism preservation (e.g. raw HTML).
 * @returns The transformed uniorg AST.
 */
export function transformMdastToUniorgAst(
  mdast: MdastRoot,
  options: MdastToUniorgOptions = {}
): OrgData {
  currentOptions = options
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
    case "delete":
      return {
        type: "strike-through",
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
    case "inlineCode":
      return { type: "code", value: node.value }
    case "html":
      // inline raw html is a md-ism: preserved as an org export snippet
      return mdismEnabled("html")
        ? {
            type: "export-snippet",
            backEnd: "html",
            value: node.value
          }
        : null
    case "image":
      // org has no dedicated image syntax: a plain file link renders
      // inline, alt text becomes the link description
      return {
        type: "link",
        format: "bracket",
        linkType: "file",
        rawLink: node.url,
        path: node.url,
        children: node.alt ? [{ type: "text", value: node.alt }] : []
      } as unknown as ObjectType
    // TODO: Add handlers for other mdast phrasing content types
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
    case "table": {
      const [headerRow, ...bodyRows] = node.children
      // GFM column alignment maps to an org alignment cookie row
      // (| <l> | <r> | <c> |) directly below the header rule
      const cookieRow = (node.align || []).some(Boolean)
        ? [
            {
              type: "table-row",
              rowType: "standard",
              children: (node.align || []).map(align => ({
                type: "table-cell",
                children: align
                  ? [{ type: "text", value: `<${align.charAt(0)}>` }]
                  : []
              }))
            }
          ]
        : []
      const rows = [
        ...(headerRow ? [transformMdastTableRow(headerRow)] : []),
        { type: "table-row", rowType: "rule", children: [] },
        ...cookieRow,
        ...bodyRows.map(transformMdastTableRow)
      ]
      return {
        type: "table",
        tableType: "org",
        tblfm: null,
        children: rows
      } as unknown as ElementType
    }
    case "html":
      // block raw html is a md-ism: preserved as an org export block
      return mdismEnabled("html")
        ? ({
            type: "export-block",
            backend: "html",
            value: node.value
          } as unknown as ElementType)
        : null
    case "blockquote":
      return {
        type: "quote-block",
        children: node.children
          .map(transformMdastNodeToUniorgNode)
          .filter(Boolean)
      } as unknown as ElementType
    case "code":
      return (node.lang
        ? { type: "src-block", language: node.lang, value: node.value }
        : {
            type: "example-block",
            value: node.value
          }) as unknown as ElementType
    // TODO: Add handlers for other mdast node types (blockquote, code, thematicBreak, etc.)
    default:
      return null
  }
}

function transformMdastTableRow(row: MdastTableRow): unknown {
  return {
    type: "table-row",
    rowType: "standard",
    children: row.children.map(cell => ({
      type: "table-cell",
      children: cell.children
        .map(transformMdastPhrasingContentToUniorgObject)
        .filter(Boolean) as ObjectType[]
    }))
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
