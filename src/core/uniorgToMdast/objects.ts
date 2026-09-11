import type { PhrasingContent } from "mdast"
import type { ObjectType } from "uniorg"
import { toString as orgastToString } from "orgast-util-to-string"
import {
  htmlEnabled,
  orgNodeToText,
  warn,
  type TransformContext
} from "./shared.js"
import { transformFootnoteReference } from "./footnotes.js"

const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

export function transformUniorgObjects(
  ctx: TransformContext,
  children: ObjectType[] | undefined
): PhrasingContent[] {
  return (children || [])
    .flatMap(child => transformUniorgObjectToMdastPhrasingContent(ctx, child))
    .filter(Boolean) as PhrasingContent[]
}

function transformUniorgObjectToMdastPhrasingContent(
  ctx: TransformContext,
  node: ObjectType
): PhrasingContent | PhrasingContent[] | null {
  switch (node.type) {
    case "text":
      return { type: "text", value: node.value }
    case "bold":
      return {
        type: "strong",
        children: transformUniorgObjects(ctx, node.children)
      }
    case "italic":
      return {
        type: "emphasis",
        children: transformUniorgObjects(ctx, node.children)
      }
    case "strike-through":
      return {
        type: "delete",
        children: transformUniorgObjects(ctx, node.children)
      }
    case "link":
      return transformUniorgLink(ctx, node)
    case "code":
    case "verbatim":
      return { type: "inlineCode", value: node.value }
    case "line-break":
      return { type: "break" }
    case "footnote-reference":
      return transformFootnoteReference(ctx, node)
    case "underline":
    case "superscript":
    case "subscript":
      return transformScriptMarkup(ctx, node)
    case "latex-fragment":
      // display-only paragraphs become math blocks (see the paragraph
      // handler); a fragment inside running text is inline math
      return {
        type: "inlineMath",
        value: node.contents.trim()
      } as unknown as PhrasingContent
    case "entity":
      // org export renders entities as their character; \alpha → α
      return { type: "text", value: node.utf8 }
    case "timestamp":
      // md has no timestamps; keep the raw org value as text so the
      // return trip re-parses it natively
      return { type: "text", value: node.rawValue }
    case "statistics-cookie":
      return { type: "text", value: node.value }
    case "citation" as ObjectType["type"]:
      // org-cite has no md equivalent; keep the raw [cite:…] text so the
      // return trip re-parses it natively
      return { type: "text", value: orgNodeToText(node).trim() }
    case "verbatim-inline" as ObjectType["type"]:
      // preset-emitted passthrough: rendered unescaped by a custom
      // stringify handler (see orgToMarkdown)
      return {
        type: "verbatimInline",
        value: (node as unknown as { value: string }).value
      } as unknown as PhrasingContent
    case "export-snippet":
      return transformExportSnippet(node)
    // remaining object types have no mapping; dropped with a warning
    default:
      warn(ctx, `dropped org ${node.type}`)
      return null
  }
}

function transformUniorgLink(
  ctx: TransformContext,
  node: Extract<ObjectType, { type: "link" }>
): PhrasingContent {
  const descriptionText = orgastToString(node)
  // org has no dedicated image syntax; the common convention is a
  // link to an image file, so map those to markdown images
  if (IMAGE_EXTENSION_RE.test(node.rawLink)) {
    return { type: "image", url: node.rawLink, alt: descriptionText }
  }
  // a description equal to the url (a common Logseq pattern) is no
  // description: text === url makes remark-stringify emit an
  // autolink (<url>), which restores to a plain org link. Urls full
  // of / and _ re-parse as italic/subscript inside the description
  // (and even uniorg-stringify garbles them back), so compare with
  // org's emphasis-marker characters stripped from both sides
  const withoutMarkers = (value: string): string =>
    value.replace(/[/*_+~={}]/g, "")
  const serializedDescription = node.children.length
    ? orgNodeToText({
        type: "paragraph",
        children: node.children,
        contentsBegin: 0,
        contentsEnd: 0
      }).trim()
    : ""
  if (
    !node.children.length ||
    withoutMarkers(serializedDescription) === withoutMarkers(node.rawLink)
  ) {
    return {
      type: "link",
      url: node.rawLink,
      children: [{ type: "text", value: node.rawLink }]
    }
  }
  const children = transformUniorgObjects(ctx, node.children)
  // md cannot nest links; flatten a description that contains one
  // (org parses bare urls inside descriptions as links)
  const flattened = children.some(
    child => child.type === "link" || child.type === "image"
  )
    ? [{ type: "text", value: descriptionText } as PhrasingContent]
    : children
  return { type: "link", url: node.rawLink, children: flattened }
}

function transformScriptMarkup(
  ctx: TransformContext,
  node: Extract<ObjectType, { type: "underline" | "superscript" | "subscript" }>
): PhrasingContent | PhrasingContent[] {
  // markdown has no equivalents; with useHtml render as raw html
  // (a preserved md-ism on the return trip), otherwise keep the raw
  // org markup as text so the return trip re-parses it natively
  // (convergent, like inline timestamps)
  if (htmlEnabled(ctx, node.type)) {
    const tagName =
      node.type === "underline"
        ? "u"
        : node.type === "superscript"
          ? "sup"
          : "sub"
    return [
      { type: "html", value: `<${tagName}>` },
      ...transformUniorgObjects(ctx, node.children),
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

function transformExportSnippet(
  node: Extract<ObjectType, { type: "export-snippet" }>
): PhrasingContent {
  if (node.backEnd !== "html") {
    // kept as raw @@backend:…@@ text (unescaped) so the return trip
    // re-parses the snippet natively
    return {
      type: "verbatimInline",
      value: `@@${node.backEnd}:${node.value}@@`
    } as unknown as PhrasingContent
  }
  return { type: "html", value: node.value }
}
