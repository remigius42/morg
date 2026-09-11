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
  interpretHtml?: boolean
  onWarning?: (message: string) => void
}

interface TransformContext {
  options: MdastToUniorgOptions
  // link definitions of the current run, for resolving reference-style
  // links and images to inline (org has no reference links)
  definitions: Map<string, { url: string; title?: string }>
}

function mdismEnabled(ctx: TransformContext, key: string): boolean {
  return toggleEnabled(ctx.options.preserveMdisms, key)
}

function warn(ctx: TransformContext, message: string): void {
  ctx.options.onWarning?.(message)
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
  const ctx: TransformContext = { options, definitions: new Map() }
  visit(mdast, "definition", (definition: Definition) => {
    ctx.definitions.set(definition.identifier, {
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
        : [transformMdastNodeToUniorgNode(ctx, child)]
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

// html tags morg itself emits under useHtml; with interpretHtml a bare
// open/close pair becomes the corresponding native org object
const INLINE_HTML_ORG_TYPES: Record<string, ObjectType["type"]> = {
  u: "underline",
  sup: "superscript",
  sub: "subscript"
}

// tag names are case-insensitive and may have whitespace before
// the closing > (valid html); attributes disqualify the tag
function matchInlineHtmlPair(
  children: PhrasingContent[],
  i: number
): { orgType: ObjectType["type"]; end: number } | null {
  const node = children[i] as PhrasingContent
  if (node.type !== "html") {
    return null
  }
  const tag = /^<(u|sup|sub)\s*>$/i.exec(node.value)?.[1]?.toLowerCase()
  const orgType = tag ? INLINE_HTML_ORG_TYPES[tag] : undefined
  if (!orgType) {
    return null
  }
  const closeTag = new RegExp(`^</${tag}\\s*>$`, "i")
  const end = children.findIndex(
    (child, j) => j > i && child.type === "html" && closeTag.test(child.value)
  )
  return end === -1 ? null : { orgType, end }
}

function transformPhrasingChildren(
  ctx: TransformContext,
  children: PhrasingContent[]
): ObjectType[] {
  const result: ObjectType[] = []
  for (let i = 0; i < children.length; i++) {
    const node = children[i] as PhrasingContent
    const pair = ctx.options.interpretHtml
      ? matchInlineHtmlPair(children, i)
      : null
    if (pair) {
      result.push({
        type: pair.orgType,
        children: transformPhrasingChildren(
          ctx,
          children.slice(i + 1, pair.end)
        )
      } as ObjectType)
      i = pair.end
      continue
    }
    const transformed = transformMdastPhrasingContentToUniorgObject(ctx, node)
    if (transformed) {
      result.push(transformed)
    }
  }
  return result
}

function transformMdastLink(
  ctx: TransformContext,
  linkNode: Extract<PhrasingContent, { type: "link" }>
): ObjectType {
  const [only] = linkNode.children
  // text equal to the url (autolinks) is no description; a plain
  // [[url]] keeps the org side canonical
  const linkChildren =
    linkNode.children.length === 1 &&
    only?.type === "text" &&
    only.value === linkNode.url
      ? []
      : transformPhrasingChildren(ctx, linkNode.children)
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

function transformMdastLinkReference(
  ctx: TransformContext,
  node: Extract<PhrasingContent, { type: "linkReference" }>
): ObjectType | null {
  // org has no reference-style links: resolve to an inline link
  const definition = ctx.definitions.get(node.identifier)
  if (!definition) {
    return null
  }
  return transformMdastPhrasingContentToUniorgObject(ctx, {
    type: "link",
    url: definition.url,
    children: node.children
  })
}

function transformMdastImageReference(
  ctx: TransformContext,
  node: Extract<PhrasingContent, { type: "imageReference" }>
): ObjectType | null {
  const definition = ctx.definitions.get(node.identifier)
  if (!definition) {
    return null
  }
  return transformMdastPhrasingContentToUniorgObject(ctx, {
    type: "image",
    url: definition.url,
    alt: node.alt ?? null
  })
}

function transformMdastImage(
  ctx: TransformContext,
  node: Extract<PhrasingContent, { type: "image" }>
): ObjectType {
  // org has no dedicated image syntax: a plain file link renders
  // inline, alt text becomes the link description; the title
  // attribute has no org slot and is dropped (see README)
  if (node.title) {
    warn(ctx, `dropped image title "${node.title}" (${node.url})`)
  }
  return {
    type: "link",
    format: "bracket",
    linkType: "file",
    rawLink: node.url,
    path: node.url,
    children: node.alt ? [{ type: "text", value: node.alt }] : []
  } as unknown as ObjectType
}

function transformMdastInlineMath(node: PhrasingContent): ObjectType {
  const value = (node as unknown as { value: string }).value
  return {
    type: "latex-fragment",
    value: `$${value}$`,
    contents: value
  } as unknown as ObjectType
}

function transformMdastPhrasingContentToUniorgObject(
  ctx: TransformContext,
  node: PhrasingContent
): ObjectType | null {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value }
    case "emphasis":
      return {
        type: "italic",
        children: transformPhrasingChildren(ctx, node.children)
      }
    case "strong":
      return {
        type: "bold",
        children: transformPhrasingChildren(ctx, node.children)
      }
    case "delete":
      return {
        type: "strike-through",
        children: transformPhrasingChildren(ctx, node.children)
      }
    case "link":
      return transformMdastLink(ctx, node)
    case "linkReference":
      return transformMdastLinkReference(ctx, node)
    case "imageReference":
      return transformMdastImageReference(ctx, node)
    case "inlineCode":
      return { type: "code", value: node.value }
    case "inlineMath" as PhrasingContent["type"]:
      return transformMdastInlineMath(node)
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
      return mdismEnabled(ctx, "html")
        ? {
            type: "export-snippet",
            backEnd: "html",
            value: node.value
          }
        : null
    case "image":
      return transformMdastImage(ctx, node)
    // remaining phrasing types have no mapping; dropped with a warning
    default:
      warn(ctx, `dropped md ${(node as { type: string }).type}`)
      return null
  }
}

function transformMdastTable(
  ctx: TransformContext,
  node: Extract<RootContent, { type: "table" }>
): ElementType {
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
    ...(headerRow ? [transformMdastTableRow(ctx, headerRow)] : []),
    { type: "table-row", rowType: "rule", children: [] },
    ...cookieRow,
    ...bodyRows.map(row => transformMdastTableRow(ctx, row))
  ]
  return {
    type: "table",
    tableType: "org",
    tblfm: null,
    children: rows
  } as unknown as ElementType
}

function transformMdastHtml(
  ctx: TransformContext,
  node: Extract<RootContent, { type: "html" }>
): ElementType | null {
  // html comments are markdown's comment idiom and map natively to
  // org comments (not an md-ism)
  const comment = /^<!--([\s\S]*?)-->\s*$/.exec(node.value)
  if (comment) {
    return {
      type: "comment",
      value: (comment[1] ?? "").trim()
    } as unknown as ElementType
  }
  if (ctx.options.interpretHtml) {
    const descriptiveList = interpretDefinitionList(node.value)
    if (descriptiveList) {
      return descriptiveList
    }
  }
  // block raw html is a md-ism: preserved as an org export block
  return mdismEnabled(ctx, "html")
    ? ({
        type: "export-block",
        backend: "html",
        value: node.value
      } as unknown as ElementType)
    : null
}

function transformMdastCode(
  node: Extract<RootContent, { type: "code" }>
): ElementType {
  // a table.el-tagged fence restores the verbatim table.el table it
  // was serialized from
  if (node.lang === "table.el") {
    return {
      type: "table",
      tableType: "table.el",
      tblfm: "",
      value: `${node.value}\n`
    } as unknown as ElementType
  }
  return (node.lang
    ? { type: "src-block", language: node.lang, value: node.value }
    : {
        type: "example-block",
        value: node.value
      }) as unknown as ElementType
}

// \begin… blocks restore to latex environments; plain display math
// becomes a $$…$$ fragment (org's display form)
function transformMdastMath(node: RootContent | PhrasingContent): ElementType {
  const value = (node as unknown as { value: string }).value
  if (value.startsWith("\\begin{")) {
    return {
      type: "latex-environment",
      affiliated: {},
      value
    } as unknown as ElementType
  }
  return {
    type: "paragraph",
    children: [
      {
        type: "latex-fragment",
        value: `$$\n${value}\n$$`,
        contents: `\n${value}\n`
      }
    ],
    contentsBegin: 0,
    contentsEnd: 0
  } as unknown as ElementType
}

function transformMdastHeading(
  ctx: TransformContext,
  node: Extract<RootContent, { type: "heading" }>
): ElementType {
  return {
    type: "headline",
    level: node.depth,
    todoKeyword: null,
    priority: null,
    commented: false,
    rawValue: toString(node),
    tags: [],
    children: transformPhrasingChildren(ctx, node.children)
  }
}

function transformMdastNodeToUniorgNode(
  ctx: TransformContext,
  node: RootContent | PhrasingContent
): GreaterElementType | ElementType | Text | null {
  switch (node.type) {
    case "heading":
      return transformMdastHeading(ctx, node)
    case "paragraph": {
      // a paragraph of only #+KEY: lines is affiliated keywords (or
      // mid-file keywords) traveling verbatim; emit as raw text so they
      // glue to the following element without a blank line — org only
      // attaches affiliated keywords when directly above their element
      const keywordLines = keywordOnlyLines(node)
      if (keywordLines) {
        return { type: "text", value: `${keywordLines.join("\n")}\n` }
      }
      return {
        type: "paragraph",
        children: transformPhrasingChildren(ctx, node.children),
        contentsBegin: 0, // Placeholder
        contentsEnd: 0 // Placeholder
      } as Paragraph
    }
    case "text":
      return { type: "text", value: node.value }
    case "list":
      return transformMdastList(ctx, node, 0)
    case "table":
      return transformMdastTable(ctx, node)
    case "html":
      return transformMdastHtml(ctx, node)
    case "thematicBreak":
      return { type: "horizontal-rule" } as unknown as ElementType
    case "footnoteDefinition":
      return {
        type: "footnote-definition",
        label: node.identifier,
        affiliated: {},
        children: node.children
          .map(child => transformMdastNodeToUniorgNode(ctx, child))
          .filter(Boolean)
      } as unknown as ElementType
    case "blockquote":
      return {
        type: "quote-block",
        children: node.children
          .map(child => transformMdastNodeToUniorgNode(ctx, child))
          .filter(Boolean)
      } as unknown as ElementType
    case "code":
      return transformMdastCode(node)
    case "math" as RootContent["type"]:
      return transformMdastMath(node)
    case "definition":
      // consumed by reference-style link resolution
      return null
    // remaining block types have no mapping; dropped with a warning
    default:
      warn(ctx, `dropped md ${node.type}`)
      return null
  }
}

const KEYWORD_LINE_RE = /^#\+\S+: /

function keywordOnlyLines(node: {
  children: PhrasingContent[]
}): string[] | null {
  if (!node.children.every(child => child.type === "text")) {
    return null
  }
  const lines = node.children
    .map(child => (child as { value: string }).value)
    .join("")
    .split("\n")
  return lines.length && lines.every(line => KEYWORD_LINE_RE.test(line))
    ? lines
    : null
}

function transformMdastTableRow(
  ctx: TransformContext,
  row: MdastTableRow
): unknown {
  return {
    type: "table-row",
    rowType: "standard",
    children: row.children.map(cell => ({
      type: "table-cell",
      children: transformPhrasingChildren(ctx, cell.children)
    }))
  }
}

// a bare <dl> whose body is nothing but attribute-less <dt>/<dd> pairs
// (any whitespace between tags) becomes a ` :: ` list — the same
// markdown convention descriptive lists use without useHtml, so the
// org side re-parses it as a native descriptive list; anything richer
// stays a preserved md-ism
function interpretDefinitionList(html: string): ElementType | null {
  const body = /^<dl\s*>([\s\S]*)<\/dl\s*>\s*$/i.exec(html.trim())?.[1]
  if (!body) {
    return null
  }
  const entries: [string, string][] = []
  const leftover = body.replace(
    /<dt\s*>([^<]*)<\/dt\s*>\s*<dd\s*>([^<]*)<\/dd\s*>/gi,
    (_match, term: string, definition: string) => {
      entries.push([term.trim(), definition.trim()])
      return ""
    }
  )
  if (!entries.length || leftover.trim() !== "") {
    return null
  }
  return {
    type: "plain-list",
    listType: "unordered",
    indent: 0,
    affiliated: {},
    children: entries.map(([term, definition]) => ({
      type: "list-item",
      indent: 0,
      bullet: "- ",
      counter: null,
      checkbox: null,
      children: [{ type: "text", value: `${term} :: ${definition}\n` }],
      contentsBegin: 0,
      contentsEnd: 0
    })),
    contentsBegin: 0,
    contentsEnd: 0
  } as unknown as ElementType
}

// Mirrors the AST shape uniorg-parse produces for lists: ordered numbering
// lives in each item's bullet, and nested lists sit inside the parent
// item's children with indent = parent indent + bullet length.
function transformMdastList(
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
