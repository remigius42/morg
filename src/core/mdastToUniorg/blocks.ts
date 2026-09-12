import type {
  RootContent,
  PhrasingContent,
  TableRow as MdastTableRow
} from "mdast"
import type { ElementType } from "uniorg"
import { toString } from "orgast-util-to-string"
import { parse as parseYaml } from "yaml"
import { mdismEnabled, type TransformContext } from "./context.js"
import { transformPhrasingChildren } from "./phrasing.js"

// a keyword is a single line, so anything that is not a single-line
// scalar is JSON-encoded and restored by JSON.parse on the way back
function keywordValue(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return JSON.stringify(value)
  }
  const text = String(value)
  return text.includes("\n") ? JSON.stringify(text) : text
}

// frontmatter entries become #+KEY: value keywords; scalar values as-is,
// structured values JSON-encoded on a single line (see ADR 0002)
export function frontmatterToKeywords(yamlValue: string): ElementType[] {
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
        value: keywordValue(value)
      }) as unknown as ElementType
  )
}

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

export function transformMdastHtml(
  ctx: TransformContext,
  node: Extract<RootContent, { type: "html" }>
): ElementType | null {
  // html comments are markdown's comment idiom and map natively to
  // org comments (not an md-ism)
  const comment = /^<!--([\s\S]*?)-->\s*$/.exec(node.value)
  if (comment) {
    return {
      type: "comment",
      // inverse of the escaping applied when the comment was emitted
      value: (comment[1] ?? "").trim().replaceAll("--&gt;", "-->")
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

// a bare <dl> whose body is nothing but attribute-less <dt>/<dd> pairs
// (any whitespace between tags) becomes a ` :: ` list — the same
// markdown convention descriptive lists use without useHtml, so the
// org side re-parses it as a native descriptive list; anything richer
// stays a preserved md-ism
// inverse of the escaping the useHtml side applies to <dt>/<dd> text
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
      children: [{ type: "text", value: `${term} :: ${definition}\n` }],
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
  return (node.lang
    ? { type: "src-block", language: node.lang, value: node.value }
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

const KEYWORD_LINE_RE = /^#\+\S+: /

export function keywordOnlyLines(node: {
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
