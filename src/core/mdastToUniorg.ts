import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  Definition,
  List as MdastList,
  ListItem as MdastListItem,
  TableRow as MdastTableRow
} from "mdast"
import { visit } from "unist-util-visit"
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
import { parse as parseYaml } from "yaml"
import { toggleEnabled, type Toggle } from "../options.js"

export interface MdastToUniorgOptions {
  preserveMdisms?: Toggle
}

// options for the current transformMdastToUniorgAst run; the transform is
// synchronous, so module state is safe and avoids threading the options
// through every recursive call site
let currentOptions: MdastToUniorgOptions = {}

// link definitions of the current run, for resolving reference-style
// links and images to inline (org has no reference links)
let currentDefinitions = new Map<string, { url: string; title?: string }>()

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
  currentDefinitions = new Map()
  visit(mdast, "definition", (definition: Definition) => {
    currentDefinitions.set(definition.identifier, {
      url: definition.url,
      ...(definition.title != null && { title: definition.title })
    })
  })
  const children: (GreaterElementType | ElementType)[] = mdast.children
    .flatMap(child =>
      // frontmatter maps to org keywords, a native construct (one mdast
      // node fans out to one keyword per entry)
      child.type === "yaml"
        ? frontmatterToKeywords(child.value)
        : [transformMdastNodeToUniorgNode(child)]
    )
    .filter(Boolean) as (GreaterElementType | ElementType)[]

  const orgAst: OrgData = {
    type: "org-data",
    children: children,
    contentsBegin: 0, // Placeholder
    contentsEnd: 0 // Placeholder
  }

  return orgAst
}

// frontmatter entries become #+KEY: value keywords; scalar values as-is,
// structured values JSON-encoded on a single line (see ADR 0002)
function frontmatterToKeywords(yamlValue: string): ElementType[] {
  const data: unknown = parseYaml(yamlValue)
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return []
  }
  return Object.entries(data).map(
    ([key, value]) =>
      ({
        type: "keyword",
        affiliated: {},
        key: key.toUpperCase(),
        value:
          value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : String(value)
      }) as unknown as ElementType
  )
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
    case "linkReference": {
      // org has no reference-style links: resolve to an inline link
      const definition = currentDefinitions.get(node.identifier)
      if (!definition) {
        return null
      }
      return transformMdastPhrasingContentToUniorgObject({
        type: "link",
        url: definition.url,
        children: node.children
      })
    }
    case "imageReference": {
      const definition = currentDefinitions.get(node.identifier)
      if (!definition) {
        return null
      }
      return transformMdastPhrasingContentToUniorgObject({
        type: "image",
        url: definition.url,
        alt: node.alt ?? null
      })
    }
    case "inlineCode":
      return { type: "code", value: node.value }
    case "break":
      return { type: "line-break" } as unknown as ObjectType
    case "footnoteReference":
      return {
        type: "footnote-reference",
        label: node.identifier,
        footnoteType: "standard",
        children: []
      } as unknown as ObjectType
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
    case "thematicBreak":
      return { type: "horizontal-rule" } as unknown as ElementType
    case "footnoteDefinition":
      return {
        type: "footnote-definition",
        label: node.identifier,
        affiliated: {},
        children: node.children
          .map(transformMdastNodeToUniorgNode)
          .filter(Boolean)
      } as unknown as ElementType
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
