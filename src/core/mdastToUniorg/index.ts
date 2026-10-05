import type {
  Root as MdastRoot,
  RootContent,
  PhrasingContent,
  Definition,
  Html,
  List
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
  fitsKeywordLine,
  fitsPropertyLine,
  markModeLine,
  renderFileHeader,
  takeMorgEntry,
  takesMorgEntries,
  type FrontmatterNode
} from "../frontmatterBlock.js"
import {
  keywordOnlyLines,
  transformMdastCode,
  transformMdastHeading,
  transformMdastHtml,
  transformMdastMath,
  transformMdastTable
} from "./blocks.js"
import { transformMdastDefList, transformMdastList } from "./lists.js"
import { transformPhrasingChildren } from "./phrasing.js"
import { DESCRIPTIVE_LIST_MARKER } from "../descriptiveTags.js"

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
  const orgAst = transformMdastToUniorgDraft(mdast, options)
  renderFileHeader(orgAst)
  return orgAst
}

/**
 * md→org pipeline: like `transformMdastToUniorgAst`, but the frontmatter
 * stays a `morg-frontmatter` node a preset can still take entries out
 * of; `renderFileHeader` turns it into the block.
 */
export function transformMdastToUniorgDraft(
  mdast: MdastRoot,
  options: MdastToUniorgOptions = {}
): OrgData {
  const ctx: TransformContext = {
    options,
    definitions: new Map(),
    markedLists: takeDescriptiveListMarkers(mdast)
  }
  visit(mdast, "definition", (definition: Definition) => {
    ctx.definitions.set(definition.identifier, {
      url: definition.url,
      ...(definition.title != null && { title: definition.title })
    })
  })
  const firstBody = mdast.children.find(child => child.type !== "yaml")
  const children: (GreaterElementType | ElementType)[] = mdast.children
    .flatMap(child => {
      // frontmatter is passive data, org keywords can act; it travels
      // inert in a marked comment block (ADR 0005)
      if (child.type === "yaml") {
        return transformFrontmatter(child.value)
      }
      const node = transformMdastNodeToUniorgNode(ctx, child)
      if (child === firstBody) {
        markModeLine(node)
      }
      return [node]
    })
    .filter(Boolean) as (GreaterElementType | ElementType)[]

  const orgAst: OrgData = {
    type: "org-data",
    children: children,
    contentsBegin: 0, // Placeholder
    contentsEnd: 0 // Placeholder
  }

  return orgAst
}

const MARKER_RE = new RegExp(`^<!--\\s*${DESCRIPTIVE_LIST_MARKER}\\s*-->$`)

// a marker comment right above a list is morg's: the list below it is
// org's descriptive one, its ` :: ` the terms' (ADR 0007 §3)
function takeDescriptiveListMarkers(mdast: MdastRoot): Set<List> {
  const lists = new Set<List>()
  visit(mdast, "html", (node: Html, index, parent) => {
    const list = parent?.children[(index ?? 0) + 1]
    if (
      index === undefined ||
      list?.type !== "list" ||
      !MARKER_RE.test(node.value.trim())
    ) {
      return
    }
    lists.add(list)
    parent?.children.splice(index, 1)
    return index
  })
  return lists
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
      // glue to the following element without a blank line: org only
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
    case "defList":
      return transformMdastDefList(ctx, node, 0)
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
        children: transformBlockChildren(
          ctx,
          node.children.map(child => quotedHeadingAsText(ctx, child))
        )
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

// Emacs ends a quote block at a headline; the text stays
function quotedHeadingAsText(
  ctx: TransformContext,
  node: RootContent
): RootContent {
  if (node.type !== "heading") {
    return node
  }
  warn(ctx, "heading inside a blockquote became text")
  return { type: "paragraph", children: node.children }
}

// morg's own entries, both or neither: one left in the YAML would keep
// the other from joining it again on the way back
function takeMorgEntries(yaml: string): {
  keywords: [string, string][]
  properties: [string, string][]
  yaml: string
} {
  // most frontmatter holds neither: no need to parse it
  if (!yaml.includes("morg_")) {
    return { keywords: [], properties: [], yaml }
  }
  const taken = takeMorgEntry(yaml, "morg_keywords", fitsKeywordLine)
  const rest = takeMorgEntry(taken.yaml, "morg_properties", fitsPropertyLine)
  return takesMorgEntries(rest.yaml)
    ? { keywords: taken.keywords, properties: rest.keywords, yaml: rest.yaml }
    : { keywords: [], properties: [], yaml }
}

function keywordNodes(keywords: [string, string][]): ElementType[] {
  return keywords.map(
    ([key, value]) =>
      ({
        type: "keyword",
        affiliated: {},
        key,
        value
      }) as unknown as ElementType
  )
}

// org's own keywords go back to keywords; the rest of the frontmatter
// stays inert data in the block
function transformFrontmatter(value: string): ElementType[] {
  // in the org file's line endings, which are LF
  const lf = value.replaceAll("\r\n", "\n")
  const { keywords, properties, yaml } = takeMorgEntries(lf)
  const drawer = properties.length
    ? [
        {
          type: "property-drawer",
          children: properties.map(([key, propertyValue]) => ({
            type: "node-property",
            key,
            value: propertyValue
          }))
        } as unknown as ElementType
      ]
    : []
  const nodes = keywordNodes(keywords)
  // an empty frontmatter stays a block
  if (yaml || !(keywords.length || properties.length)) {
    const node: FrontmatterNode = { type: "morg-frontmatter", yaml }
    nodes.push(node as unknown as ElementType)
  }
  return [...drawer, ...nodes]
}
