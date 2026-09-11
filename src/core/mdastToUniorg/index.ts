import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  Definition
} from "mdast"
import { visit } from "unist-util-visit"
import type {
  OrgData,
  Paragraph,
  Text,
  ElementType,
  GreaterElementType
} from "uniorg"
import { warn, type TransformContext } from "./context.js"
import {
  frontmatterToKeywords,
  keywordOnlyLines,
  transformMdastCode,
  transformMdastHeading,
  transformMdastHtml,
  transformMdastMath,
  transformMdastTable
} from "./blocks.js"
import { transformMdastList } from "./lists.js"
import { transformPhrasingChildren } from "./phrasing.js"

export type { MdastToUniorgOptions, TransformContext } from "./context.js"
import type { MdastToUniorgOptions } from "./context.js"

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

function transformBlockChildren(
  ctx: TransformContext,
  children: RootContent[]
): (GreaterElementType | ElementType | Text)[] {
  return children
    .map(child => transformMdastNodeToUniorgNode(ctx, child))
    .filter(Boolean) as (GreaterElementType | ElementType | Text)[]
}

export function transformMdastNodeToUniorgNode(
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
        children: transformBlockChildren(ctx, node.children)
      } as unknown as ElementType
    case "blockquote":
      return {
        type: "quote-block",
        children: transformBlockChildren(ctx, node.children)
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
