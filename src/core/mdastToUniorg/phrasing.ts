import type { PhrasingContent } from "mdast"
import type { ObjectType } from "uniorg"
import { mdismEnabled, warn, type TransformContext } from "./context.js"

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

// an org bracket-link path cannot contain [ or ]; percent-encoding keeps
// the url equivalent and, unlike org's backslash escaping, survives being
// parsed back (uniorg does not decode `\[`)
function orgSafeUrl(ctx: TransformContext, url: string): string {
  if (!/[[\]]/.test(url)) {
    return url
  }
  warn(ctx, `percent-encoded brackets in url "${url}"`)
  return url.replaceAll("[", "%5B").replaceAll("]", "%5D")
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
  const url = orgSafeUrl(ctx, linkNode.url)
  return {
    type: "link",
    format: "bracket", // Assuming bracket format for Markdown links
    linkType: "url",
    rawLink: url,
    path: url,
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
  const url = orgSafeUrl(ctx, node.url)
  return {
    type: "link",
    format: "bracket",
    linkType: "file",
    rawLink: url,
    path: url,
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
