import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  Heading,
  List as MdastList,
  ListItem as MdastListItem,
  BlockContent,
  DefinitionContent
} from "mdast"
import type {
  OrgData,
  ElementType,
  GreaterElementType,
  ObjectType,
  Text,
  List,
  ListItem,
  TableRow
} from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import { stringify as stringifyYaml } from "yaml"
import { toggleEnabled, type Toggle } from "../options.js"

export interface UniorgToMdastOptions {
  preserveOrgisms?: Toggle
  useHtml?: Toggle
}

// options for the current transformUniorgAstToMdast run; the transform is
// synchronous, so module state is safe and avoids threading the options
// through every recursive call site
let currentOptions: UniorgToMdastOptions = {}

function orgismEnabled(key: string): boolean {
  return toggleEnabled(currentOptions.preserveOrgisms, key)
}

function htmlEnabled(key: string): boolean {
  return toggleEnabled(currentOptions.useHtml, key, false)
}

/**
 * Transforms a uniorg AST to a mdast (Markdown AST).
 * @param uniorgAst The uniorg AST to transform.
 * @param options Controls org-ism serialization (`key:: value` lines).
 * @returns The transformed mdast.
 */
export function transformUniorgAstToMdast(
  uniorgAst: OrgData,
  options: UniorgToMdastOptions = {}
): MdastRoot {
  currentOptions = options
  const nodes = uniorgAst.children || []
  // leading #+KEY: value keywords map to md frontmatter, a native
  // construct; JSON-encoded values restore their structure (ADR 0002)
  const frontmatter: Record<string, unknown> = {}
  let first = 0
  while (nodes[first]?.type === "keyword") {
    const keyword = nodes[first] as unknown as { key: string; value: string }
    frontmatter[keyword.key.toLowerCase()] = parseKeywordValue(keyword.value)
    first++
  }
  const children: RootContent[] = nodes
    .slice(first)
    .flatMap(transformUniorgNodeToMdastNode)
    .filter(Boolean) as RootContent[]
  if (first > 0) {
    children.unshift({
      type: "yaml",
      value: stringifyYaml(frontmatter).trimEnd()
    })
  }
  return { type: "root", children: children }
}

function parseKeywordValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// custom mdast node stringified verbatim (see orgToMarkdown handlers) so
// keys like custom_id are not markdown-escaped to custom\_id
function keyValueParagraph(lines: string[]): RootContent {
  return { type: "keyValue", value: lines.join("\n") } as unknown as RootContent
}

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

function transformUniorgObjectToMdastPhrasingContent(
  node: ObjectType
): PhrasingContent | PhrasingContent[] | null {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value }
    case "bold":
      return {
        type: "strong",
        children: transformUniorgObjects(node.children)
      }
    case "italic":
      return {
        type: "emphasis",
        children: transformUniorgObjects(node.children)
      }
    case "strike-through":
      return {
        type: "delete",
        children: transformUniorgObjects(node.children)
      }
    case "link": {
      const children = transformUniorgObjects(node.children)
      // org has no dedicated image syntax; the common convention is a
      // link to an image file, so map those to markdown images
      if (IMAGE_EXTENSION_RE.test(node.rawLink)) {
        const description = children
          .map(child => ("value" in child ? child.value : ""))
          .join("")
        return { type: "image", url: node.rawLink, alt: description }
      }
      return {
        type: "link",
        url: node.rawLink,
        // a plain org link has no description; mdast needs children, and
        // text === url makes remark-stringify emit an autolink (<url>)
        children: children.length
          ? children
          : [{ type: "text", value: node.rawLink }]
      }
    }
    case "code":
    case "verbatim":
      return { type: "inlineCode", value: node.value }
    case "line-break":
      return { type: "break" }
    case "footnote-reference":
      return {
        type: "footnoteReference",
        identifier: node.label,
        label: node.label
      }
    case "underline":
    case "superscript":
    case "subscript": {
      // markdown has no equivalents; with useHtml render as raw html
      // (a preserved md-ism on the return trip), otherwise keep the raw
      // org markup as text so the return trip re-parses it natively
      // (convergent, like inline timestamps)
      if (htmlEnabled(node.type)) {
        const tagName =
          node.type === "underline"
            ? "u"
            : node.type === "superscript"
              ? "sup"
              : "sub"
        return [
          { type: "html", value: `<${tagName}>` },
          ...transformUniorgObjects(node.children),
          { type: "html", value: `</${tagName}>` }
        ]
      }
      const content = orgastToString(node)
      return {
        type: "text",
        value:
          node.type === "underline"
            ? `_${content}_`
            : node.type === "superscript"
              ? `^{${content}}`
              : `_{${content}}`
      }
    }
    case "export-snippet":
      return node.backEnd === "html"
        ? { type: "html", value: node.value }
        : null
    // TODO: Add handlers for other uniorg object types
    default:
      return null
  }
}

function cellText(cell: TableRow["children"][number]): string {
  return (cell.children || [])
    .map(child => (child.type === "text" ? child.value : ""))
    .join("")
    .trim()
}

function isAlignmentCookieRow(row: TableRow): boolean {
  const cells = row.children || []
  return (
    cells.length > 0 &&
    cells.every(cell => {
      const text = cellText(cell)
      return text === "" || /^<[lrc]\d*>$/.test(text)
    }) &&
    cells.some(cell => cellText(cell) !== "")
  )
}

// org cell content keeps the aligning whitespace padding; markdown
// cells are re-padded by the stringifier
function trimCellPadding(node: PhrasingContent): PhrasingContent {
  if (node.type === "text") {
    node.value = node.value.trim()
  }
  return node
}

// uniorg block values keep the newline before the #+end_ line; mdast
// code values do not include it
function trimTrailingNewline(value: string): string {
  return value.replace(/\n$/, "")
}

function transformUniorgObjects(
  children: ObjectType[] | undefined
): PhrasingContent[] {
  return (children || [])
    .flatMap(transformUniorgObjectToMdastPhrasingContent)
    .filter(Boolean) as PhrasingContent[]
}

function transformUniorgNodeToMdastNode(
  node: GreaterElementType | ElementType | Text
): RootContent | RootContent[] | null {
  switch (node.type) {
    case "section":
      return (node.children || [])
        .flatMap(transformUniorgNodeToMdastNode)
        .filter(Boolean) as RootContent[]
    case "headline": {
      const heading: RootContent = {
        type: "heading",
        depth: node.level as Heading["depth"],
        children: transformUniorgObjects(node.children)
      }
      // org-isms serialize as key:: value lines directly below the heading
      const isms: string[] = []
      if (node.todoKeyword && orgismEnabled("todo")) {
        isms.push(`todo:: ${node.todoKeyword}`)
      }
      if (node.priority && orgismEnabled("priority")) {
        isms.push(`priority:: ${node.priority}`)
      }
      if (node.tags.length && orgismEnabled("tags")) {
        isms.push(`tags:: ${node.tags.join(", ")}`)
      }
      return isms.length ? [heading, keyValueParagraph(isms)] : heading
    }
    case "planning": {
      const isms: string[] = []
      if (node.scheduled && orgismEnabled("scheduled")) {
        isms.push(`scheduled:: ${node.scheduled.rawValue}`)
      }
      if (node.deadline && orgismEnabled("deadline")) {
        isms.push(`deadline:: ${node.deadline.rawValue}`)
      }
      if (node.closed && orgismEnabled("closed")) {
        isms.push(`closed:: ${node.closed.rawValue}`)
      }
      return isms.length ? keyValueParagraph(isms) : null
    }
    case "property-drawer": {
      if (!orgismEnabled("properties")) {
        return null
      }
      const isms = (node.children || [])
        .filter(child => child.type === "node-property")
        .map(property => `${property.key}:: ${property.value}`)
      return isms.length ? keyValueParagraph(isms) : null
    }
    case "paragraph": {
      const children = transformUniorgObjects(node.children)
      // uniorg keeps trailing blank lines inside the paragraph node; strip
      // them so remark-stringify produces canonical spacing.
      const last = children[children.length - 1]
      if (last?.type === "text") {
        last.value = last.value.replace(/\n+$/, "")
        if (last.value === "") {
          children.pop()
        }
      }
      return { type: "paragraph", children }
    }
    case "text":
      // Whitespace-only text at block level is a formatting artifact.
      if (node.value.trim() === "") {
        return null
      }
      return { type: "text", value: node.value }
    case "plain-list":
      if (node.listType === "descriptive" && htmlEnabled("descriptiveList")) {
        return descriptiveListToHtml(node)
      }
      return transformUniorgList(node)
    case "table": {
      if (node.tableType === "table.el") {
        // TODO: table.el tables (verbatim value, no cell structure)
        return null
      }
      const standardRows = (node.children || []).filter(
        (row): row is TableRow =>
          row.type === "table-row" && row.rowType === "standard"
      )
      // an org alignment cookie row (| <l> | <r> | <c> |) becomes GFM
      // column alignment instead of a content row
      const cookieRow = standardRows.find(isAlignmentCookieRow)
      const align = cookieRow
        ? (cookieRow.children || []).map(cell => {
            const cookie = /^<([lrc])\d*>$/.exec(cellText(cell))?.[1]
            return cookie === "l"
              ? ("left" as const)
              : cookie === "r"
                ? ("right" as const)
                : cookie === "c"
                  ? ("center" as const)
                  : null
          })
        : null
      return {
        type: "table",
        align,
        children: standardRows
          .filter(row => row !== cookieRow)
          .map(row => ({
            type: "tableRow",
            children: (row.children || []).map(cell => ({
              type: "tableCell",
              children: transformUniorgObjects(cell.children).map(
                trimCellPadding
              )
            }))
          }))
      } as unknown as RootContent
    }
    case "horizontal-rule":
      return { type: "thematicBreak" }
    case "footnote-definition":
      return {
        type: "footnoteDefinition",
        identifier: node.label,
        label: node.label,
        children: (node.children || [])
          .flatMap(transformUniorgNodeToMdastNode)
          .filter(Boolean) as BlockContent[]
      }
    case "export-block":
      return node.backend === "html"
        ? { type: "html", value: trimTrailingNewline(node.value) }
        : null
    case "quote-block":
      return {
        type: "blockquote",
        children: (node.children || [])
          .flatMap(transformUniorgNodeToMdastNode)
          .filter(Boolean) as BlockContent[]
      }
    case "src-block":
      return {
        type: "code",
        lang: node.language || null,
        value: trimTrailingNewline(node.value)
      }
    case "example-block":
      return {
        type: "code",
        lang: null,
        value: trimTrailingNewline(node.value)
      }
    // TODO: Add handlers for other uniorg node types
    default:
      return null
  }
}

// with useHtml a descriptive list renders as a <dl> block (a preserved
// md-ism on the return trip); terms and definitions are flattened to text
function descriptiveListToHtml(node: List): RootContent {
  const lines = ["<dl>"]
  for (const item of node.children || []) {
    if (item.type !== "list-item") {
      continue
    }
    const tag = (item.children || []).find(
      child => (child as { type: string }).type === "list-item-tag"
    )
    const definition = (item.children || []).filter(child => child !== tag)
    lines.push(`<dt>${tag ? orgastToString(tag).trim() : ""}</dt>`)
    lines.push(
      `<dd>${definition
        .map(child => orgastToString(child))
        .join("")
        .trim()}</dd>`
    )
  }
  lines.push("</dl>")
  return { type: "html", value: lines.join("\n") }
}

// A single blank line does not end a list in org, so one uniorg plain-list
// can mix ordered and unordered bullets. Markdown cannot: split the items
// into runs by bullet kind, one mdast list per run.
function transformUniorgList(node: List): MdastList[] {
  const items = (node.children || []).filter(
    (child): child is ListItem => child.type === "list-item"
  )
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
  return runs.map(run => {
    const firstBullet = run[0]?.bullet ?? "- "
    const ordered = /^\d/.test(firstBullet)
    return {
      type: "list",
      ordered,
      start: ordered ? parseInt(firstBullet, 10) || 1 : null,
      spread: false,
      children: run.map(transformUniorgListItem)
    }
  })
}

function transformUniorgListItem(item: ListItem): MdastListItem {
  // a descriptive list item starts with a list-item-tag (the term); md has
  // no descriptive lists, so keep the ` :: ` syntax literally in the item
  // text — the return trip re-parses it as a descriptive list
  const tag = (item.children || []).find(
    child => (child as { type: string }).type === "list-item-tag"
  )
  const children = (item.children || [])
    .filter(child => child !== tag)
    .flatMap(transformUniorgNodeToMdastNode)
    .filter(Boolean) as (BlockContent | DefinitionContent)[]
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
  return {
    type: "listItem",
    spread: false,
    checked:
      item.checkbox === "on" ? true : item.checkbox === "off" ? false : null,
    children
  }
}
