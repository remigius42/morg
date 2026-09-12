import type {
  OrgData,
  Headline,
  Paragraph,
  PropertyDrawer,
  NodeProperty,
  Text,
  Link
} from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { toString } from "orgast-util-to-string"
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

function headingProperty(level: number): NodeProperty {
  return { type: "node-property", key: "heading", value: String(level) }
}

function headingDrawer(level: number): PropertyDrawer {
  return {
    type: "property-drawer",
    children: [headingProperty(level)],
    contentsBegin: 0,
    contentsEnd: 0
  }
}

// org fixes the order below a headline: the planning line first, then a
// single property drawer. :heading: therefore has to let the planning
// line pass and join an existing drawer rather than displace either.
// Returns whether the property has been placed on `node`.
function placeHeadingProperty(node: { type: string }, level: number): boolean {
  if (node.type === "planning") {
    return false
  }
  if (node.type !== "property-drawer") {
    return false
  }
  ;(node as unknown as PropertyDrawer).children.unshift(headingProperty(level))
  return true
}

// the page name of a [[page]] link destination, or null. The core
// transform percent-encodes brackets in urls (an org link path cannot
// hold them), so the destination arrives here already encoded.
function pageRefUrlTarget(rawLink: string): string | null {
  const decoded = rawLink.replaceAll("%5B", "[").replaceAll("%5D", "]")
  return /^\[\[(.+)\]\]$/.exec(decoded)?.[1] ?? null
}

// Logseq md labeled page refs ([label]([[page]])) become org's
// [[page][label]] description syntax. A page name containing a space is
// not a valid CommonMark destination, so the ref travels as plain text;
// without one remark parses it as a real link instead.
function rewriteLabeledPageRefs(uniorgAst: OrgData): void {
  visit(uniorgAst as Parent, "text", (node: Text) => {
    node.value = node.value.replace(
      /\[([^\]]+)\]\(\[\[([^\]]+)\]\]\)/g,
      "[[$2][$1]]"
    )
  })
  visit(uniorgAst as Parent, "link", (node: Link) => {
    const page = pageRefUrlTarget(node.rawLink)
    if (page === null) {
      return
    }
    node.linkType = "fuzzy"
    node.rawLink = page
    node.path = page
  })
}

function toBlockHeadline(node: Paragraph, level: number): { type: string } {
  const blockHeadline: Partial<Headline> = {
    type: "headline",
    level,
    todoKeyword: null,
    priority: null,
    commented: false,
    rawValue: "",
    tags: [],
    children: node.children
  }
  takeTaskMarker(blockHeadline as Headline)
  return blockHeadline as { type: string }
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
  rewriteLabeledPageRefs(uniorgAst)
  const children = uniorgAst.children as unknown as { type: string }[]
  const result: { type: string }[] = []
  let currentLevel = 0
  // level of a headline whose :heading: property still needs a home
  let pending: number | null = null
  const separate = (): void => {
    if (!nestUnderHeadings) {
      result.push({ type: "text", value: "\n" } as Text)
    }
  }
  // no drawer took the property: give it one of its own
  const settle = (): void => {
    if (pending === null) {
      return
    }
    result.push(headingDrawer(pending))
    pending = null
    separate()
  }
  for (const node of children) {
    if (node.type === "headline") {
      settle()
      const headline = node as unknown as Headline
      currentLevel = headline.level
      takeTaskMarker(headline)
      result.push(node)
      pending = headline.level
      continue
    }
    if (pending !== null) {
      if (placeHeadingProperty(node, pending)) {
        pending = null
        result.push(node)
        separate()
        continue
      }
      if (node.type !== "planning") {
        settle()
      }
    }
    result.push(
      nestUnderHeadings && node.type === "paragraph"
        ? toBlockHeadline(node as unknown as Paragraph, currentLevel + 1)
        : node
    )
  }
  settle()
  uniorgAst.children = result as unknown as OrgData["children"]
  return uniorgAst
}

// Logseq md keeps TODO/DONE as leading text markers and priorities as
// [#A] text; in org they are the headline's TODO keyword and priority
// (other Logseq markers like DOING are not org keywords and simply
// stay in the title text)
function takeTaskMarker(headline: Headline): void {
  const first = headline.children[0]
  if (first?.type !== "text") {
    return
  }
  const marker = /^(TODO|DONE) (?:\[#([A-Z])\] )?/.exec(first.value)
  if (!marker) {
    return
  }
  headline.todoKeyword = marker[1] as string
  if (marker[2]) {
    headline.priority = marker[2]
  }
  first.value = first.value.slice((marker[0] ?? "").length)
}

/**
 * Extracts Logseq-specific conventions from a uniorg AST: headlines with
 * a `:heading:` property become plain headings of that level, headlines
 * without one are outline blocks and become paragraphs.
 * @param uniorgAst The Logseq-flavored uniorg AST to transform.
 * @returns The generic uniorg AST.
 */
function extractLogseqSpecificsFromUniorgAst(uniorgAst: OrgData): OrgData {
  extractInParent(uniorgAst)
  repairHighlights(uniorgAst)
  fuzzyLinksToPageRefs(uniorgAst)
  markHiccupParagraphs(uniorgAst)
  return uniorgAst
}

// Logseq highlight markup (^^words^^) re-parses as a caret plus a
// superscript; merge the pieces back into literal text
function repairHighlights(uniorgAst: OrgData): void {
  visit(uniorgAst as Parent, node => {
    const children = (node as Partial<Parent>).children as unknown[] | undefined
    if (!children) {
      return
    }
    for (let i = 0; i + 1 < children.length; i++) {
      const current = children[i] as { type?: string; value?: string }
      const next = children[i + 1] as { type?: string }
      if (
        current?.type === "text" &&
        current.value?.endsWith("^") &&
        next?.type === "superscript"
      ) {
        current.value += `^${toString(next as Parameters<typeof toString>[0])}`
        children.splice(i + 1, 1)
        i--
      }
    }
  })
}

// Logseq page and block references: [[page]] stays a wikilink,
// [[page][label]] becomes [label]([[page]]), [[((uuid))][label]]
// becomes [label](((uuid))) — emitted unescaped via verbatim-inline
const BLOCK_REF_RE = /^\(\(.*\)\)$/

function pageRefValue(label: string, target: string): string {
  if (!label) {
    return `[[${target}]]`
  }
  if (BLOCK_REF_RE.test(target)) {
    return `[${label}](${target})`
  }
  return `[${label}]([[${target}]])`
}

function fuzzyLinksToPageRefs(uniorgAst: OrgData): void {
  visit(
    uniorgAst as Parent,
    "link",
    (node: Parent & { linkType?: string; rawLink?: string }, index, parent) => {
      const target = node.rawLink ?? ""
      const isBlockRef = BLOCK_REF_RE.test(target)
      if ((node.linkType !== "fuzzy" && !isBlockRef) || !parent) {
        return undefined
      }
      const label = node.children.length ? toString(node) : ""
      const value = pageRefValue(label, target)
      parent.children[index as number] = {
        type: "verbatim-inline",
        value
      } as unknown as Parent["children"][number]
      return undefined
    }
  )
}

// hiccup blocks ([:tag …]) are Logseq markup, not links or footnotes; a
// verbatim-inline node keeps the brackets unescaped in Markdown output
function markHiccupParagraphs(uniorgAst: OrgData): void {
  visit(uniorgAst as Parent, "paragraph", (node: Paragraph) => {
    const text = toString(node)
    if (text.startsWith("[:")) {
      node.children = [
        { type: "verbatim-inline", value: text.replace(/\n$/, "") }
      ] as unknown as Paragraph["children"]
    }
  })
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
    if (headline.todoKeyword) {
      // back to Logseq md's text conventions (TODO [#A] Ship it);
      // verbatim-inline keeps the [#A] brackets unescaped
      const priority = headline.priority ? `[#${headline.priority}] ` : ""
      headline.children.unshift({
        type: "verbatim-inline",
        value: `${headline.todoKeyword} ${priority}`
      } as unknown as Headline["children"][number])
      headline.todoKeyword = null
      headline.priority = null
    }
    // a planning line sits between the headline and its drawer
    const drawerIndex = children[i + 1]?.type === "planning" ? i + 2 : i + 1
    const heading = takeHeadingProperty(children, drawerIndex)
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
