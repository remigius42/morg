import type { OrgData, Keyword, Paragraph, Text, Link } from "uniorg"
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
import { tryParse } from "../core/render.js"
import type { Link as MdastLink, Root as MdastRoot } from "mdast"
import type { Preset } from "./types.js"
import { markdownOutlineToOrg, orgOutlineToMarkdown } from "./logseqOutline.js"

/**
 * Logseq dialect preset: the outline of blocks, page properties, page
 * and block references, highlights and hiccup.
 */
export function logseq(): Preset {
  const page: Preset = {
    name: "logseq",
    applyToMdast: keepPagePropertySource,
    applyToUniorg: uniorgAst => {
      rewriteLabeledPageRefs(uniorgAst)
      takePageProperties(uniorgAst)
      return uniorgAst
    },
    extractFromUniorg: uniorgAst => {
      pageProperties(uniorgAst)
      return extractInlineSpecifics(uniorgAst)
    }
  }
  const bareUrls = new Map<string, number>()
  const block: Preset = {
    name: "logseq",
    applyToMdast: mdast => {
      countBareUrls(mdast, bareUrls)
      emailLinksToText(mdast)
    },
    applyToUniorg: uniorgAst => {
      rewriteLabeledPageRefs(uniorgAst)
      restoreBareUrls(uniorgAst, bareUrls)
      return uniorgAst
    },
    extractFromUniorg: uniorgAst => {
      bareUrlsToText(uniorgAst)
      return extractInlineSpecifics(uniorgAst)
    }
  }
  return {
    ...page,
    convertOrg: (org, convert) =>
      orgOutlineToMarkdown(org, convert, { page, block }),
    convertMarkdown: (markdown, convert) =>
      markdownOutlineToOrg(markdown, convert, { page, block })
  }
}

// Logseq md writes a url bare, as org writes a plain link; the core
// carries a md link as a [[url]] bracket link, so md→org counts the
// links that were bare in the source and turns as many back to plain.
// Where org's plain link ends short of md's autolink on trailing
// punctuation (a macro's `}}`), that tail splits off as text
function countBareUrls(mdast: MdastRoot, counts: Map<string, number>): void {
  counts.clear()
  visit(mdast, "link", (node, index, parent) => {
    const url = bareUrl(node)
    if (url === null) {
      return undefined
    }
    counts.set(url, (counts.get(url) ?? 0) + 1)
    const tail = node.url.slice(url.length)
    if (tail && parent && index !== undefined) {
      node.url = url
      node.children = [{ type: "text", value: url }]
      parent.children.splice(index + 1, 0, { type: "text", value: tail })
    }
    return undefined
  })
}

// the plain link org reads for a link written bare, if the rest is
// trailing punctuation
function bareUrl(node: MdastLink): string | null {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (
    start === undefined ||
    end === undefined ||
    end - start !== node.url.length
  ) {
    return null
  }
  const url = orgPlainLink(node.url)
  return url !== null && /^[^\w(]*$/.test(node.url.slice(url.length))
    ? url
    : null
}

// the url of the plain link org reads at the start of `url`, if any;
// it ends early at a `(` (`…/Bandwidth_(signal)`) or a macro's `}}`
function orgPlainLink(url: string): string | null {
  if (!/^https?:\/\//.test(url)) {
    return null
  }
  const [paragraph] = tryParse(`${url}\n`)?.children ?? []
  const [link] = (paragraph as Parent | undefined)?.children ?? []
  return (link as Partial<Link> | undefined)?.format === "plain"
    ? (link as Link).rawLink
    : null
}

function restoreBareUrls(
  uniorgAst: OrgData,
  counts: Map<string, number>
): void {
  visit(uniorgAst as Parent, "link", (node: Link) => {
    const count = counts.get(node.rawLink) ?? 0
    if (node.format === "bracket" && !node.children.length && count) {
      node.format = "plain"
      counts.set(node.rawLink, count - 1)
    }
  })
}

// org→md: a plain http(s) link stays a bare url, unescaped
// an email address is text in Logseq org and written bare in Logseq md,
// where GFM links it: md→org takes such a link back to its text, and
// org→md keeps the address unescaped (keepVerbatimText)
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/

function emailLinksToText(mdast: MdastRoot): void {
  visit(mdast, "link", (node, index, parent) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    const text = node.url.replace(/^mailto:/, "")
    if (
      node.url.startsWith("mailto:") &&
      start !== undefined &&
      end !== undefined &&
      end - start === text.length &&
      parent &&
      index !== undefined
    ) {
      parent.children[index] = { type: "text", value: text }
    }
  })
}

function bareUrlsToText(uniorgAst: OrgData): void {
  visit(
    uniorgAst as Parent,
    "link",
    (node: Link, index: number | undefined, parent: Parent | undefined) => {
      if (
        node.format !== "plain" ||
        !/^https?$/.test(node.linkType) ||
        !parent ||
        index === undefined
      ) {
        return undefined
      }
      parent.children[index] = {
        type: "verbatim-inline",
        value: node.rawLink
      } as unknown as Parent["children"][number]
      return undefined
    }
  )
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

function extractInlineSpecifics(uniorgAst: OrgData): OrgData {
  keepVerbatimText(uniorgAst)
  repairHighlights(uniorgAst)
  fuzzyLinksToPageRefs(uniorgAst)
  markHiccupParagraphs(uniorgAst)
  return uniorgAst
}

// text Logseq md writes as it is, which remark would escape: a task's
// priority ([#A]), an email address, and a tag's # (`#tag` starting a
// line, which mldoc reads as escaped plain text once written `\#`);
// verbatim-inline keeps it
const VERBATIM_TEXT_RE = new RegExp(
  `(\\[#[A-Z]\\]|${EMAIL_RE.source}|(?<!\\S)#(?=[^\\s#]|$))`
)

function keepVerbatimText(uniorgAst: OrgData): void {
  visit(
    uniorgAst as Parent,
    "text",
    (node: Text, index: number | undefined, parent: Parent | undefined) => {
      const parts = node.value.split(VERBATIM_TEXT_RE)
      if (parts.length === 1 || !parent || index === undefined) {
        return undefined
      }
      // split's captures sit at the odd indices
      const nodes = parts
        .map((value, i) => ({
          type: i % 2 ? "verbatim-inline" : "text",
          value
        }))
        .filter(part => part.value)
      parent.children.splice(
        index,
        1,
        ...(nodes as unknown as Parent["children"])
      )
      return index + nodes.length
    }
  )
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
