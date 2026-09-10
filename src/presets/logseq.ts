import type {
  OrgData,
  Headline,
  Paragraph,
  PropertyDrawer,
  NodeProperty,
  Text
} from "uniorg"
import type { Parent } from "unist"
import type { Preset } from "./types.js"

export interface LogseqPresetOptions {
  /**
   * Content following a heading becomes children of that heading's block
   * in Logseq's outline: paragraphs turn into child block headlines one
   * level deeper; other constructs stay in the preceding block's body.
   * Default: `true`.
   */
  nestUnderHeadings?: boolean
}

/**
 * Logseq dialect preset: `heading::` properties and outline nesting.
 */
export function logseq(options: LogseqPresetOptions = {}): Preset {
  const nestUnderHeadings = options.nestUnderHeadings ?? true
  return {
    name: "logseq",
    applyToUniorg: uniorgAst =>
      applyLogseqSpecificsToUniorgAst(uniorgAst, nestUnderHeadings),
    extractFromUniorg: extractLogseqSpecificsFromUniorgAst
  }
}

function headingDrawer(level: number): PropertyDrawer {
  const property: NodeProperty = {
    type: "node-property",
    key: "heading",
    value: String(level)
  }
  return {
    type: "property-drawer",
    children: [property],
    contentsBegin: 0,
    contentsEnd: 0
  }
}

/**
 * Applies Logseq-specific conventions to a uniorg AST: every heading gets
 * a `:heading:` property drawer, and with `nestUnderHeadings` following
 * paragraphs become child block headlines (in Logseq's org format every
 * outline block is a headline).
 * @param uniorgAst The uniorg AST to transform.
 * @param nestUnderHeadings Nest content as child blocks. Default: `true`.
 * @returns The Logseq-flavored uniorg AST.
 */
export function applyLogseqSpecificsToUniorgAst(
  uniorgAst: OrgData,
  nestUnderHeadings = true
): OrgData {
  const children = uniorgAst.children as unknown as { type: string }[]
  const result: { type: string }[] = []
  let currentLevel = 0
  for (const node of children) {
    if (node.type === "headline") {
      const headline = node as unknown as Headline
      currentLevel = headline.level
      result.push(node, headingDrawer(headline.level))
      if (!nestUnderHeadings) {
        result.push({ type: "text", value: "\n" } as Text)
      }
    } else if (nestUnderHeadings && node.type === "paragraph") {
      const blockHeadline: Partial<Headline> = {
        type: "headline",
        level: currentLevel + 1,
        todoKeyword: null,
        priority: null,
        commented: false,
        rawValue: "",
        tags: [],
        children: (node as unknown as Paragraph).children
      }
      result.push(blockHeadline as { type: string })
    } else {
      result.push(node)
    }
  }
  uniorgAst.children = result as unknown as OrgData["children"]
  return uniorgAst
}

/**
 * Extracts Logseq-specific conventions from a uniorg AST: headlines with
 * a `:heading:` property become plain headings of that level, headlines
 * without one are outline blocks and become paragraphs.
 * @param uniorgAst The Logseq-flavored uniorg AST to transform.
 * @returns The generic uniorg AST.
 */
export function extractLogseqSpecificsFromUniorgAst(
  uniorgAst: OrgData
): OrgData {
  extractInParent(uniorgAst)
  return uniorgAst
}

function extractInParent(parent: Parent): void {
  const children = parent.children as unknown as { type: string }[]
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (!node) {
      continue
    }
    if (node.type === "section") {
      extractInParent(node as unknown as Parent)
      continue
    }
    if (node.type !== "headline") {
      continue
    }
    const headline = node as unknown as Headline
    const heading = takeHeadingProperty(children, i + 1)
    if (heading !== null) {
      headline.level = heading
    } else {
      // a block headline (no :heading:) is outline structure only; its
      // title is the block's content
      children[i] = {
        type: "paragraph",
        children: headline.children,
        contentsBegin: 0,
        contentsEnd: 0
      } as unknown as Paragraph
    }
  }
}

// removes the heading property from a drawer at `index` (and the drawer
// itself if that empties it); returns the heading level or null
function takeHeadingProperty(
  children: { type: string }[],
  index: number
): number | null {
  const drawer = children[index]
  if (drawer?.type !== "property-drawer") {
    return null
  }
  const properties = (drawer as unknown as PropertyDrawer).children
  const heading = properties.find(property => property.key === "heading")
  if (!heading) {
    return null
  }
  const remaining = properties.filter(property => property !== heading)
  if (remaining.length) {
    ;(drawer as unknown as PropertyDrawer).children = remaining
  } else {
    children.splice(index, 1)
  }
  return parseInt(heading.value, 10) || null
}
