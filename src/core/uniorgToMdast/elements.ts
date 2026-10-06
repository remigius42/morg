import type {
  BlockContent,
  Heading,
  Image,
  PhrasingContent,
  RootContent
} from "mdast"
import type {
  AffiliatedKeywords,
  ElementType,
  GreaterElementType,
  Text
} from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import {
  affiliatedLines,
  htmlEnabled,
  keyName,
  keyValueParagraph,
  orgismEnabled,
  orgNodeToText,
  trimTrailingNewline,
  warn,
  type TransformContext
} from "./shared.js"
import { transformUniorgObjects } from "./objects.js"
import { transformFootnoteDefinition } from "./footnotes.js"
import { transformTable } from "./tables.js"
import { transformPlainList } from "./lists.js"
import { imgTag, loneAttrHtmlSize } from "../sizedImages.js"
import { mayReadAsMarkdown, PROPERTIES_MARKER } from "../keyValueLines.js"
import { ORG_VERBATIM } from "../render.js"
import {
  alertMarker,
  alertQuote,
  isAlertType,
  keepCalloutMarker
} from "../alerts.js"

export function transformNodes(
  ctx: TransformContext,
  nodes: (GreaterElementType | ElementType | Text)[]
): RootContent[] {
  return nodes
    .flatMap(node => transformUniorgNodeToMdastNode(ctx, node))
    .filter(Boolean) as RootContent[]
}

function transformUniorgNodeToMdastNode(
  ctx: TransformContext,
  node: GreaterElementType | ElementType | Text
): RootContent | RootContent[] | null {
  const image = sizedImage(ctx, node)
  if (image) {
    return image
  }
  const result = transformUniorgElement(ctx, node)
  const lines = affiliatedLines(node)
  if (
    !result ||
    !lines.length ||
    (!Array.isArray(result) && (result as { type: string }).type === "keyValue")
  ) {
    // verbatim passthroughs (keyValue) already carry their affiliated
    // lines via orgNodeToText
    return result
  }
  return [
    keyValueParagraph(lines),
    ...(Array.isArray(result) ? result : [result])
  ]
}

// the size a lone #+ATTR_HTML: line gives, and the other keywords
function imageSize(affiliated: AffiliatedKeywords = {}) {
  const { ATTR_HTML: attrHtml, ...others } = affiliated
  return { size: loneAttrHtmlSize(attrHtml), others }
}

// the image a paragraph's lone link shows, if it is one
function loneImage(
  ctx: TransformContext,
  children: Extract<ElementType, { type: "paragraph" }>["children"]
): Image | undefined {
  const links = children.filter(
    child => !(child.type === "text" && child.value.trim() === "")
  )
  const [image] =
    links.length === 1 && links[0]?.type === "link"
      ? transformUniorgObjects(ctx, links)
      : []
  return image?.type === "image" ? image : undefined
}

// a paragraph of one image link its #+ATTR_HTML: line sizes, spelled
// in html: the size goes into the <img>, other keywords stay lines
function sizedImage(
  ctx: TransformContext,
  node: GreaterElementType | ElementType | Text
): RootContent[] | null {
  if (node.type !== "paragraph" || !htmlEnabled(ctx, "images")) {
    return null
  }
  const { size, others } = imageSize(node.affiliated)
  const image = size && loneImage(ctx, node.children)
  if (!size || !image) {
    return null
  }
  const lines = affiliatedLines({ affiliated: others })
  return [
    ...(lines.length ? [keyValueParagraph(lines)] : []),
    { type: "html", value: imgTag(image.url, image.alt ?? "", size) }
  ]
}

// org-only blocks with no md equivalent travel the same way as
// drawers: verbatim org text, re-parsed natively on the return trip
// (keywords here are mid-file ones; leading ones became frontmatter),
// as does a preset's org text
const VERBATIM_TYPES = new Set<string>([
  "special-block",
  "center-block",
  "verse-block",
  "comment-block",
  "keyword",
  "babel-call",
  "diary-sexp",
  "clock",
  ORG_VERBATIM
])

function transformUniorgElement(
  ctx: TransformContext,
  node: GreaterElementType | ElementType | Text
): RootContent | RootContent[] | null {
  if (node.type === "special-block" && isAlertType(node.blockType)) {
    return transformQuoteBlock(ctx, alertQuote(node, alertMarker(node)))
  }
  if (VERBATIM_TYPES.has(node.type)) {
    return keyValueParagraph([orgNodeToText(node)])
  }
  switch (node.type) {
    case "section":
      return transformSection(ctx, node)
    case "headline":
      return transformHeadline(ctx, node)
    case "planning":
      return transformPlanning(ctx, node)
    case "drawer":
      return transformDrawer(ctx, node)
    case "fixed-width":
      // its `: ` would start a Markdown definition (ADR 0007); escaped,
      // Markdown reads the `:` as text, which org reads as fixed-width
      return keyValueParagraph([
        orgNodeToText(node).replace(/^([ \t]*):(?=[ \t]|$)/gm, "$1\\:")
      ])
    case "property-drawer":
      return transformPropertyDrawer(ctx, node)
    case "paragraph":
      return transformParagraph(ctx, node)
    case "text":
      // Whitespace-only text at block level is a formatting artifact.
      if (node.value.trim() === "") {
        return null
      }
      return { type: "text", value: node.value }
    case "plain-list":
      return transformPlainList(ctx, node)
    case "table":
      return tableWithFormulas(ctx, node)
    case "horizontal-rule":
      return { type: "thematicBreak" }
    case "footnote-definition":
      return transformFootnoteDefinition(ctx, node)
    case "export-block":
      return transformExportBlock(node)
    case "quote-block":
      return transformQuoteBlock(ctx, node)
    case "src-block":
      return transformSrcBlock(node)
    case "example-block":
      return transformExampleBlock(node)
    case "comment":
      return transformComment(node)
    case "latex-environment":
      return { type: "math", value: node.value } as unknown as RootContent
    // remaining element types have no mapping; dropped with a warning
    default:
      warn(ctx, `dropped org ${node.type}`)
      return null
  }
}

function transformSection(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "section" }>
): RootContent | RootContent[] {
  if (ctx.options.taskCheckboxes) {
    const task = sectionAsTaskItem(ctx, node.children || [])
    if (task) {
      return task
    }
  }
  return transformNodes(ctx, node.children || [])
}

// with taskCheckboxes, a section holding just a bare TODO/DONE headline
// (no priority, tags or content) becomes a GFM task item; anything
// richer keeps the heading (with a warning) so no metadata is lost
function sectionAsTaskItem(
  ctx: TransformContext,
  children: (GreaterElementType | ElementType | Text)[]
): RootContent | null {
  const headline = children[0]
  if (headline?.type !== "headline" || !headline.todoKeyword) {
    return null
  }
  const rest = children.slice(1)
  const reason =
    headline.todoKeyword !== "TODO" && headline.todoKeyword !== "DONE"
      ? `keyword ${headline.todoKeyword}`
      : headline.priority
        ? "has priority"
        : headline.tags.length
          ? "has tags"
          : rest.some(
                child => !(child.type === "text" && child.value.trim() === "")
              )
            ? "has content"
            : null
  if (reason) {
    warn(
      ctx,
      `taskCheckboxes: kept heading "${orgastToString(headline).trim()}" (${reason})`
    )
    return null
  }
  return {
    type: "list",
    ordered: false,
    spread: false,
    children: [
      {
        type: "listItem",
        spread: false,
        checked: headline.todoKeyword === "DONE",
        children: [
          {
            type: "paragraph",
            children: transformUniorgObjects(ctx, headline.children)
          }
        ]
      }
    ]
  }
}

function transformHeadline(
  ctx: TransformContext,
  node: Extract<ElementType, { type: "headline" }>
): RootContent | RootContent[] {
  const heading: RootContent = {
    type: "heading",
    depth: node.level as Heading["depth"],
    children: transformUniorgObjects(ctx, node.children)
  }
  // org-isms serialize as key:: value lines directly below the heading
  const isms: string[] = []
  if (node.todoKeyword && orgismEnabled(ctx, "todo")) {
    isms.push(`${keyName(ctx, "todo")}:: ${node.todoKeyword}`)
  }
  if (node.priority && orgismEnabled(ctx, "priority")) {
    isms.push(`${keyName(ctx, "priority")}:: ${node.priority}`)
  }
  if (node.tags.length && orgismEnabled(ctx, "tags")) {
    isms.push(`${keyName(ctx, "tags")}:: ${node.tags.join(", ")}`)
  }
  return isms.length ? [heading, keyValueParagraph(isms)] : heading
}

function transformPlanning(
  ctx: TransformContext,
  node: Extract<ElementType, { type: "planning" }>
): RootContent | null {
  const isms: string[] = []
  if (node.scheduled && orgismEnabled(ctx, "scheduled")) {
    isms.push(`${keyName(ctx, "scheduled")}:: ${node.scheduled.rawValue}`)
  }
  if (node.deadline && orgismEnabled(ctx, "deadline")) {
    isms.push(`${keyName(ctx, "deadline")}:: ${node.deadline.rawValue}`)
  }
  if (node.closed && orgismEnabled(ctx, "closed")) {
    isms.push(`${keyName(ctx, "closed")}:: ${node.closed.rawValue}`)
  }
  return isms.length ? keyValueParagraph(isms) : null
}

function transformDrawer(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "drawer" }>
): RootContent | null {
  if (!orgismEnabled(ctx, "drawers")) {
    return null
  }
  // generic drawers (:LOGBOOK: …) have no md equivalent; keep their
  // org text verbatim (unescaped) so the return trip re-parses the
  // drawer natively
  return keyValueParagraph([orgNodeToText(node)])
}

function transformPropertyDrawer(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "property-drawer" }>
): RootContent | RootContent[] | null {
  if (!orgismEnabled(ctx, "properties")) {
    return null
  }
  const properties = (node.children || []).filter(
    child => child.type === "node-property"
  )
  if (!properties.length) {
    return null
  }
  const lines = keyValueParagraph(
    properties.map(({ key, value }) =>
      value ? `${key}:: ${value}` : `${key}::`
    )
  )
  // values are org text: a marker keeps md→org from reading them as
  // Markdown
  return properties.some(({ value }) => mayReadAsMarkdown(value ?? ""))
    ? [{ type: "html", value: `<!-- ${PROPERTIES_MARKER} -->` }, lines]
    : lines
}

function transformParagraph(
  ctx: TransformContext,
  node: Extract<ElementType, { type: "paragraph" }>
): RootContent | null {
  const math = paragraphAsDisplayMath(node)
  if (math) {
    return math
  }
  const children = transformUniorgObjects(ctx, node.children)
  // md gives leading whitespace structural meaning (list
  // continuation, code); collapse per-line indentation inside
  // paragraphs, insignificant in org and in rendered md alike
  children.forEach((child, index) => {
    if (child.type === "text") {
      child.value = child.value.replace(/\n[ \t]+/g, "\n")
      if (index === 0) {
        child.value = child.value.replace(/^[ \t]+/, "")
      }
    }
  })
  trimParagraphEdges(children)
  // a paragraph emptied by the cleanup (whitespace-only) would
  // stringify as stray blank lines
  return children.length ? { type: "paragraph", children } : null
}

// a paragraph holding only a display fragment ($$…$$ or \[…\]) is
// display math and becomes a math block
function paragraphAsDisplayMath(
  node: Extract<ElementType, { type: "paragraph" }>
): RootContent | null {
  const substantial = (node.children || []).filter(
    child => !(child.type === "text" && child.value.trim() === "")
  )
  const only = substantial[0]
  if (
    substantial.length === 1 &&
    only?.type === "latex-fragment" &&
    (only.value.startsWith("$$") || only.value.startsWith("\\["))
  ) {
    return {
      type: "math",
      value: only.contents.replace(/^\n/, "").replace(/\n$/, "")
    } as unknown as RootContent
  }
  return null
}

// uniorg keeps surrounding blank lines inside the paragraph node;
// strip them so remark-stringify produces canonical spacing.
function trimParagraphEdges(children: PhrasingContent[]): void {
  const last = children[children.length - 1]
  if (last?.type === "text") {
    last.value = last.value.replace(/\n+$/, "")
    if (last.value === "") {
      children.pop()
    }
  }
  const head = children[0]
  if (head?.type === "text") {
    head.value = head.value.replace(/^\n+/, "")
    if (head.value === "") {
      children.shift()
    }
  }
}

function transformExportBlock(
  node: Extract<ElementType, { type: "export-block" }>
): RootContent {
  if (node.backend !== "html") {
    // other backends have no md meaning; verbatim like the org-only
    // blocks so the return trip restores them
    return keyValueParagraph([orgNodeToText(node)])
  }
  return { type: "html", value: trimTrailingNewline(node.value) }
}

function transformQuoteBlock(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "quote-block" }>
): RootContent {
  const children = transformNodes(ctx, node.children || []) as BlockContent[]
  keepCalloutMarker(children)
  return { type: "blockquote", children }
}

function transformSrcBlock(
  node: Extract<ElementType, { type: "src-block" }>
): RootContent {
  // switches and header arguments (`-n :results output`) are the
  // fence's meta, after the language
  const { switches, parameters } = node as {
    switches?: string | null
    parameters?: string | null
  }
  const meta = [switches, parameters].filter(Boolean).join(" ")
  return {
    type: "code",
    lang: node.language || null,
    meta: node.language && meta ? meta : null,
    value: trimTrailingNewline(node.value)
  }
}

function transformExampleBlock(
  node: Extract<ElementType, { type: "example-block" }>
): RootContent {
  return {
    type: "code",
    lang: null,
    value: trimTrailingNewline(node.value)
  }
}

function transformComment(
  node: Extract<ElementType, { type: "comment" }>
): RootContent {
  // html comments are markdown's comment idiom (hidden by every
  // renderer) and restore to org comments on the return trip; an
  // embedded `-->` would close the comment early, so escape it
  const value = node.value.replaceAll("-->", "--&gt;")
  return {
    type: "html",
    value: value.includes("\n") ? `<!--\n${value}\n-->` : `<!-- ${value} -->`
  }
}

// a formula line travels verbatim below the table, where the return
// trip writes it back. convertOrgToMarkdown sets an org table's formulas
// apart before the parse (see tableKeywords), so this takes a table.el
// table's, and a tree's from elsewhere
function tableWithFormulas(
  ctx: TransformContext,
  node: Extract<GreaterElementType, { type: "table" }>
): RootContent | RootContent[] {
  const table = transformTable(ctx, node)
  return node.tblfm
    ? [table, keyValueParagraph([`#+TBLFM: ${node.tblfm}`])]
    : table
}
