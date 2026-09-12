import type { BlockContent, Heading, PhrasingContent, RootContent } from "mdast"
import type { ElementType, GreaterElementType, Text } from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import {
  affiliatedLines,
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

function transformUniorgElement(
  ctx: TransformContext,
  node: GreaterElementType | ElementType | Text
): RootContent | RootContent[] | null {
  switch (node.type) {
    case "section":
      return transformSection(ctx, node)
    case "headline":
      return transformHeadline(ctx, node)
    case "planning":
      return transformPlanning(ctx, node)
    case "drawer":
      return transformDrawer(ctx, node)
    case "special-block":
    case "center-block":
    case "verse-block":
    case "comment-block":
    case "fixed-width":
    case "keyword":
    case "babel-call" as ElementType["type"]:
    case "diary-sexp" as ElementType["type"]:
    case "clock":
      // org-only blocks with no md equivalent travel the same way as
      // drawers: verbatim org text, re-parsed natively on the return trip
      // (keywords here are mid-file ones; leading ones became frontmatter)
      return keyValueParagraph([orgNodeToText(node)])
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
      return transformTable(ctx, node)
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
): RootContent | null {
  if (!orgismEnabled(ctx, "properties")) {
    return null
  }
  const isms = (node.children || [])
    .filter(child => child.type === "node-property")
    .map(property => `${property.key}:: ${property.value}`)
  return isms.length ? keyValueParagraph(isms) : null
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
  // paragraphs — insignificant in org and in rendered md alike
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
  return {
    type: "blockquote",
    children: transformNodes(ctx, node.children || []) as BlockContent[]
  }
}

function transformSrcBlock(
  node: Extract<ElementType, { type: "src-block" }>
): RootContent {
  return {
    type: "code",
    lang: node.language || null,
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
