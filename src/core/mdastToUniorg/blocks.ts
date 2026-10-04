import type {
  RootContent,
  PhrasingContent,
  TableRow as MdastTableRow
} from "mdast"
import type { ElementType } from "uniorg"
import { toString } from "orgast-util-to-string"
import {
  htmlInterpreted,
  mdismEnabled,
  type TransformContext
} from "./context.js"
import { transformPhrasingChildren } from "./phrasing.js"
import { tagSeparator } from "./lists.js"
import { KEYWORD_NAME } from "../frontmatterBlock.js"

export function transformMdastTable(
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

// lines without the indentation all non-blank ones share
function dedentLines(text: string): string {
  const lines = text.split("\n")
  const indent = Math.min(
    ...lines
      .filter(line => line.trim())
      .map(line => /^[ \t]*/.exec(line)?.[0].length ?? 0)
  )
  return Number.isFinite(indent)
    ? lines.map(line => line.slice(indent)).join("\n")
    : text
}

export function transformMdastHtml(
  ctx: TransformContext,
  node: Extract<RootContent, { type: "html" }>
): ElementType | null {
  // html comments are markdown's comment idiom and map natively to
  // org comments (not an md-ism)
  const comment = /^<!--([\s\S]*?)-->\s*$/.exec(node.value)
  if (comment) {
    const body = comment[1] ?? ""
    // a multi-line comment's own line breaks frame its lines, so an
    // empty first or last line is the comment's, not padding
    const lines = /^[ \t]*\n([\s\S]*)\n[ \t]*$/.exec(body)
    return {
      type: "comment",
      // inverse of the escaping applied when the comment was emitted
      value: (lines ? dedentLines(lines[1] ?? "") : body.trim()).replaceAll(
        "--&gt;",
        "-->"
      )
    } as unknown as ElementType
  }
  if (htmlInterpreted(ctx, "definitionList")) {
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

// a bare <dl> whose body is nothing but attribute-less <dt>/<dd> pairs
// (any whitespace between tags) becomes a ` :: ` list, the same
// markdown convention descriptive lists use in their markdown spelling, so the
// org side re-parses it as a native descriptive list; anything richer
// stays a preserved md-ism
// inverse of the escaping the html spelling applies to <dt>/<dd> text
function unescapeHtmlText(text: string): string {
  return text
    .trim()
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

function interpretDefinitionList(html: string): ElementType | null {
  const body = /^<dl\s*>([\s\S]*)<\/dl\s*>\s*$/i.exec(html.trim())?.[1]
  if (!body) {
    return null
  }
  const entries: [string, string][] = []
  const leftover = body.replace(
    /<dt\s*>([^<]*)<\/dt\s*>\s*<dd\s*>([^<]*)<\/dd\s*>/gi,
    (_match, term: string, definition: string) => {
      entries.push([unescapeHtmlText(term), unescapeHtmlText(definition)])
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
      children: [
        { type: "text", value: term },
        tagSeparator(false),
        { type: "text", value: `${definition}\n` }
      ],
      contentsBegin: 0,
      contentsEnd: 0
    })),
    contentsBegin: 0,
    contentsEnd: 0
  } as unknown as ElementType
}

export function transformMdastCode(
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
  // the fence's meta is the block's switches and header arguments,
  // which uniorg-stringify writes after the language
  const language = [node.lang, node.meta].filter(Boolean).join(" ")
  return (node.lang
    ? { type: "src-block", language, value: node.value }
    : {
        type: "example-block",
        value: node.value
      }) as unknown as ElementType
}

// \begin… blocks restore to latex environments; plain display math
// becomes a $$…$$ fragment (org's display form)
export function transformMdastMath(
  node: RootContent | PhrasingContent
): ElementType {
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

export function transformMdastHeading(
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

const KEYWORD_LINE_RE = new RegExp(String.raw`^#\+${KEYWORD_NAME}: `)

export function keywordOnlyLines(node: {
  children: PhrasingContent[]
}): string[] | null {
  if (!node.children.every(child => child.type === "text")) {
    return null
  }
  const lines = node.children
    .map(child => (child as { value: string }).value)
    .join("")
    .split(/\r?\n/)
  return lines.length && lines.every(line => KEYWORD_LINE_RE.test(line))
    ? lines
    : null
}
