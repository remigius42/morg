import type {
  OrgData,
  Headline,
  Keyword,
  Paragraph,
  PropertyDrawer,
  NodeProperty,
  Text,
  Link
} from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import { toString } from "orgast-util-to-string"
import { isScalar, isSeq, type Scalar } from "yaml"
import {
  fitsKeywordLine,
  isFrontmatterNode,
  isModeLine,
  isModeLineComment,
  takeFrontmatterEntries,
  type FrontmatterNode
} from "../core/frontmatterBlock.js"
import { keyValueEntries } from "../core/keyValueLines.js"
import type { Root as MdastRoot } from "mdast"
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
    applyToMdast: keepPagePropertySource,
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
  takePageProperties(uniorgAst)
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

// Logseq reads a page's first block of `key:: value` lines (md) and its
// leading `#+key: value` lines (org) as page properties (ADR 0005)
function pagePropertyEntries(text: string): [string, string][] | null {
  const entries = keyValueEntries(text)
  // a key org reads as no keyword name (begin_src) would not come back
  return entries?.every(entry => fitsKeywordLine(...entry)) ? entries : null
}

// md→org: the page property block's values are Logseq's, not Markdown;
// its source text replaces the parse, so urls and markup stay verbatim
function keepPagePropertySource(mdast: MdastRoot, markdown: string): void {
  // below the frontmatter and an Emacs mode line
  const node = mdast.children.find(
    child =>
      child.type !== "yaml" &&
      !(
        child.type === "html" &&
        child.value.startsWith("<!--") &&
        isModeLine(child.value)
      )
  )
  const start = node?.position?.start.offset
  const end = node?.position?.end.offset
  if (node?.type !== "paragraph" || start === undefined || end === undefined) {
    return
  }
  const source = markdown.slice(start, end)
  if (pagePropertyEntries(source)) {
    node.children = [{ type: "text", value: source }]
  }
}

function takePageProperties(uniorgAst: OrgData): void {
  const children = uniorgAst.children as unknown as { type: string }[]
  const keywords = takeFrontmatterKeywords(children)
  // below the keywords, the file-level drawer and a mode line
  const index = children.findIndex(
    node =>
      !["keyword", "property-drawer"].includes(node.type) &&
      !isModeLineComment(node) &&
      !isFrontmatterNode(node)
  )
  const lines = pagePropertyLines(children[index])
  if (lines) {
    children.splice(index, 1)
    keywords.push(...lines)
  }
  // ahead of the block, so all of them lead the page
  const at = children.findIndex(node => node.type !== "keyword")
  children.splice(
    at === -1 ? children.length : at,
    0,
    ...keywords.map(([key, value]) => ({ type: "keyword", key, value }))
  )
}

function takeFrontmatterKeywords(
  children: { type: string }[]
): [string, string][] {
  const frontmatter = children.find(isFrontmatterNode)
  if (!frontmatter) {
    return []
  }
  const keywords = takeFlatEntries(frontmatter)
  // an emptied block goes
  if (!frontmatter.yaml && keywords.length) {
    children.splice(children.indexOf(frontmatter), 1)
  }
  return keywords
}

function pagePropertyLines(
  node: { type: string } | undefined
): [string, string][] | null {
  // plain text only: markup in a key means the source was no key:: line
  const children = (node as Partial<Paragraph> | undefined)?.children
  if (
    node?.type !== "paragraph" ||
    !children?.every(child => child.type === "text")
  ) {
    return null
  }
  return pagePropertyEntries(toString(node))
}

// keywords that act in Emacs or in export (TODO states, startup and
// export options, file inclusion, babel calls, a dynamic block's begin
// and end lines, citations, a table of
// contents, index entries, raw export lines and exporter options, of
// org's own exporters, org-info.js and KOMA letter class files among
// them, and of ox-hugo and org-re-reveal): as frontmatter they were
// passive data, so they stay in the block. A denylist: other
// third-party exporters' keys pass. Export metadata (`title`, `author`)
// passes too, and `tags`, Logseq's page tags property
const ACTING_KEYWORD_RE =
  /^(?:(?:SEQ_|TYP_)?TODO|STARTUP|OPTIONS|INCLUDE|SETUPFILE|BIND|MACRO|CALL|PROPERTY|LINK|CONSTANTS|PRIORITIES|BIBLIOGRAPHY|CITE_EXPORT|PRINT_BIBLIOGRAPHY|ARCHIVE|CATEGORY|COLUMNS|FILETAGS|EXCLUDE_TAGS|SELECT_TAGS|BEGIN|END|TOC|(?:C|F|K|P|T|V)?INDEX|INFOJS_OPT|LCO|EXPORT_\w+|(?:HTML|LATEX|BEAMER|ODT|TEXINFO|MAN|ASCII|MD|MARKDOWN|ICALENDAR|HUGO|REVEAL)(?:_\w+)?)$/i

// flat frontmatter entries are page properties too, a sequence written
// as Logseq writes it (`a, b`); what a keyword line cannot hold stays
function takeFlatEntries(frontmatter: FrontmatterNode): [string, string][] {
  const { keywords, yaml } = takeFrontmatterEntries(
    frontmatter.yaml,
    (key, value, text) => {
      const flat = flatValue(value, text)
      // a key that comes back as a key:: line as written: uniorg
      // upper-cases it, Logseq reads it lower-cased
      return flat !== null &&
        /^[a-z0-9_-]+$/.test(text(key)) &&
        fitsKeywordLine(text(key), flat) &&
        !ACTING_KEYWORD_RE.test(text(key))
        ? [[text(key), flat]]
        : null
    }
  )
  frontmatter.yaml = yaml
  return keywords
}

function flatValue(
  value: unknown,
  text: (scalar: Scalar) => string
): string | null {
  const single = (item: unknown): string | null =>
    isScalar(item) && item.value !== null ? text(item) : null
  if (!isSeq(value)) {
    return single(value)
  }
  const items = value.items.map(single)
  return items.length &&
    items.every(item => item !== null && !item.includes(","))
    ? items.join(", ")
    : null
}

// the reverse: leading keywords become the first block, verbatim, keys
// lower-cased (uniorg upper-cases them, Logseq reads only lower case)
function pageProperties(uniorgAst: OrgData): void {
  const children = uniorgAst.children
  // below a mode line, as on the way in
  const first = children.findIndex(node => !isModeLineComment(node))
  let count = 0
  while (first !== -1 && children[first + count]?.type === "keyword") {
    count++
  }
  const leading = children.slice(first, first + count) as Keyword[]
  // a key no `key::` line holds (`CAPTION[short]`) stays a keyword
  const properties = leading.filter(keyword => /^[\w-]+$/.test(keyword.key))
  if (!properties.length) {
    return
  }
  const lines = properties.map(
    keyword =>
      `${keyword.key.toLowerCase()}::${keyword.value ? ` ${keyword.value}` : ""}`
  )
  children.splice(
    first,
    count,
    ...leading.filter(keyword => !properties.includes(keyword)),
    {
      type: "paragraph",
      children: [{ type: "verbatim-inline", value: lines.join("\n") }],
      contentsBegin: 0,
      contentsEnd: 0
    } as unknown as Paragraph
  )
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
  pageProperties(uniorgAst)
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
// becomes [label](((uuid))), emitted unescaped via verbatim-inline
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
