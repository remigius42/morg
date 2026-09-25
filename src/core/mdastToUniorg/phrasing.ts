import type { PhrasingContent } from "mdast"
import type { ObjectType } from "uniorg"
import { mdismEnabled, warn, type TransformContext } from "./context.js"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { escapeOrgPath } from "../orgPath.js"
import { orgParser, renderInline, type Node } from "../render.js"

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

export function transformPhrasingChildren(
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
      result.push(
        ...hoistEdgeWhitespace(
          joinLines({
            type: pair.orgType,
            children: transformPhrasingChildren(
              ctx,
              children.slice(i + 1, pair.end)
            )
          } as ObjectType)
        )
      )
      i = pair.end
      continue
    }
    if (node.type === "inlineCode") {
      result.push(...transformMdastInlineCode(ctx, node.value))
      continue
    }
    const transformed = transformMdastPhrasingContentToUniorgObject(ctx, node)
    if (transformed) {
      result.push(...hoistEdgeWhitespace(joinLines(transformed)))
    }
  }
  return result
}

const CONTAINER_MARKUP = new Set([
  "bold",
  "italic",
  "strike-through",
  "underline"
])

// org markup spans at most two lines; beyond that its line endings
// become spaces, as CommonMark renders them anyway (see
// transformMdastInlineCode)
function joinLines(node: ObjectType): ObjectType {
  if (!CONTAINER_MARKUP.has(node.type)) {
    return node
  }
  const texts: { value: string }[] = []
  visit(node as Parent, "text", (text: { value: string }) => {
    texts.push(text)
  })
  const lineEndings =
    texts
      .map(text => text.value)
      .join("")
      .split("\n").length - 1
  if (lineEndings > 1) {
    for (const text of texts) {
      text.value = text.value.replaceAll("\n", " ")
    }
  }
  return node
}

// strips the whitespace at the edges of `children`, returning it
function takeEdgeWhitespace(children: ObjectType[]): {
  before: string
  after: string
} {
  const first = children[0]
  const last = children.at(-1)
  let before = ""
  let after = ""
  if (first?.type === "text") {
    before = /^\s*/.exec(first.value)?.[0] ?? ""
    first.value = first.value.slice(before.length)
  }
  if (last?.type === "text") {
    after = /\s*$/.exec(last.value)?.[0] ?? ""
    last.value = last.value.slice(0, last.value.length - after.length)
  }
  return { before, after }
}

// org markup may not start or end with whitespace, which a code span's
// moved-out edge whitespace (see transformMdastInlineCode) can leave
// inside it; it moves out further, to the markup's siblings
function hoistEdgeWhitespace(node: ObjectType): ObjectType[] {
  if (!CONTAINER_MARKUP.has(node.type) || !("children" in node)) {
    return [node]
  }
  const { before, after } = takeEdgeWhitespace(node.children)
  if (!before && !after) {
    return [node]
  }
  const content = node.children.filter(
    child => child.type !== "text" || child.value !== ""
  )
  const text = (value: string): ObjectType[] =>
    value ? [{ type: "text", value }] : []
  return [
    ...text(before),
    ...(content.length ? [{ ...node, children: content } as ObjectType] : []),
    ...text(after)
  ]
}

// an org bracket-link path cannot contain [ or ]; percent-encoding keeps
// the url equivalent and, unlike org's backslash escaping, survives being
// parsed back (uniorg does not decode `\[`). A silent normalization, not
// a drop: dialect wikilink destinations take this path routinely.
function orgSafeUrl(url: string): string {
  return url.replaceAll("[", "%5B").replaceAll("]", "%5D")
}

// a url without a scheme is a relative path in markdown, but a bare org
// path is a fuzzy link (a heading search); org's file: type keeps it a
// file. A #anchor becomes org's search option, which finds a
// <<target>> or a headline of that name. `[[page]]` / `((uuid))` urls
// are dialect references (logseq), not paths
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

function isRelativePath(url: string): boolean {
  return url !== "" && !SCHEME_RE.test(url) && !/^(#|\/\/|\[|\()/.test(url)
}

// md urls are percent-encoded, org paths are not; a malformed escape
// stays as written
function decodeUrlPart(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

function orgLinkTarget(url: string): {
  rawLink: string
  linkType: "file" | "url"
} {
  if (!isRelativePath(url)) {
    return { rawLink: orgSafeUrl(url), linkType: "url" }
  }
  const hash = url.indexOf("#")
  const path = escapeOrgPath(
    decodeUrlPart(hash === -1 ? url : url.slice(0, hash))
  )
  const search =
    hash === -1
      ? ""
      : `::${escapeOrgPath(decodeUrlPart(url.slice(hash + 1)), true)}`
  return { rawLink: `file:${path}${search}`, linkType: "file" }
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
  const { rawLink, linkType } = orgLinkTarget(linkNode.url)
  return {
    type: "link",
    format: "bracket", // Assuming bracket format for Markdown links
    linkType,
    rawLink,
    path: rawLink,
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
  const { rawLink } = orgLinkTarget(node.url)
  return {
    type: "link",
    format: "bracket",
    linkType: "file",
    rawLink,
    path: rawLink,
    children: node.alt ? [{ type: "text", value: node.alt }] : []
  } as unknown as ObjectType
}

// org markup spans at most two lines; CommonMark renders a line ending
// inside a code span as a space, so nothing is lost. Org markup may not
// start or end with whitespace either: edge whitespace moves outside
// the markers, a one-space shift in the rendered output
function transformMdastInlineCode(
  ctx: TransformContext,
  value: string
): ObjectType[] {
  const [, before = "", code = "", after = ""] =
    /^(\s*)(.*?)(\s*)$/s.exec(value.replace(/\r\n?|\n/g, " ")) ?? []
  if (!code) {
    // org has no empty code markup
    warn(ctx, "whitespace-only inline code kept as text")
    return [{ type: "text", value: before }]
  }
  const type = codeType(code)
  if (!type) {
    warn(ctx, "inline code holding both ~ and = kept as text")
    return [{ type: "text", value: before + code + after }]
  }
  return [
    ...(before ? [{ type: "text", value: before } as ObjectType] : []),
    { type, value: code },
    ...(after ? [{ type: "text", value: after } as ObjectType] : [])
  ]
}

// org ends code at the first `~` it may close on (`~a~ b~`); verbatim
// keeps such code whole, and comes back as md code too, unless a `=`
// ends it early in turn
function codeType(code: string): "code" | "verbatim" | undefined {
  return (["code", "verbatim"] as const).find(
    type =>
      !code.includes(type === "code" ? "~" : "=") ||
      readsWhole({ type, value: code })
  )
}

// whether org reads `node`, rendered, back as the same node
function readsWhole(node: Node): boolean {
  const [paragraph] = orgParser.parse(renderInline(node)).children as Node[]
  const [first, ...rest] =
    paragraph && "children" in paragraph ? (paragraph.children as Node[]) : []
  return !rest.length && first?.type === node.type && first.value === node.value
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
