import { consumesBracedScripts } from "../core/bracedScripts.js"
import { readsAsLineSyntax } from "../core/lineSyntax.js"
import { ZERO_WIDTH_SPACE } from "../core/markupBoundary.js"
import {
  isDrawerStart,
  isOrgBlockStart,
  orgElementEnd
} from "../core/passthroughSource.js"
import type { ConversionContext, FragmentConverter, Preset } from "./types.js"
import { readVanillaMarkdownOutline } from "./logseqVanillaMarkdown.js"

// Logseq stores a page as an outline of blocks, each block a content
// string it parses on its own: org writes a block as its level's stars,
// a space and the content (an empty block as the bare stars), Markdown
// as a `- ` bullet indented one tab per level, continuation lines two
// spaces further in. Both are converted block by block, so a block's
// content (a code block, a table, lines that run on) is one fragment.

const ORG_BLOCK_RE = /^(\*+)(?: (.*))?$/
const MD_BLOCK_RE = /^(\t*)-(?: (.*))?$/
const PLANNING_RE = /^(?:SCHEDULED|DEADLINE): /
const ORG_PROPERTY_RE = /^:([^\s:]+):(?: (.*))?$/
const MD_PROPERTY_RE = /^([\w.-]+)::(?: (.*))?$/
// a repeated task's log line, which Logseq bullets per format
const STATE_LINE_RE = /^[-*] (?=State ")/
const MD_HEADING_RE = /^(#{1,6})(?: (.*))?$/
const FENCE_RE = /^\s*(?:```|~~~)/
// md→org adds it for the text's bare `_` and `^`, which a block's
// content holds as Logseq writes it
const BRACED_SCRIPTS_LINE = "#+OPTIONS: ^:{}"

function logbook(lines: string[], bullet: string): string[] {
  return lines[0] === ":LOGBOOK:"
    ? lines.map(line => line.replace(STATE_LINE_RE, `${bullet} `))
    : lines
}

// a block's source lines, before they are read
interface Lines {
  level: number
  lines: string[]
}

// a block's planning line or drawer, or one of its properties
export type Meta = { lines: string[] } | { key: string; value: string }

/** A block of the outline, read from either format. */
export interface Block {
  level: number
  // a heading's level, 0 for none
  heading: number
  // content that starts with the block's properties
  metaFirst: boolean
  // in source order
  meta: Meta[]
  // in the source format, its first line first
  content: string[]
}

/** A page: its properties' source lines, then its blocks. */
export interface Outline {
  page: string[]
  blocks: Block[]
}

interface Presets {
  page: Preset
  block: Preset
  // a page's source lines made ready for Vanilla Markdown
  vanillaPage?: (lines: string[]) => string[]
  // a preset made to read Vanilla Markdown as carrying its syntax
  vanillaReader?: (preset: Preset) => Preset
  // what writes Logseq's links and hiccup into Vanilla Markdown
  vanillaInline?: Preset
}

function splitBlocks(
  lines: string[],
  blockLevel: (line: string) => [number, string] | null
): { page: string[]; blocks: Lines[] } {
  const page: string[] = []
  const blocks: Lines[] = []
  for (const line of lines) {
    const start = blockLevel(line)
    if (start) {
      blocks.push({ level: start[0], lines: [start[1]] })
    } else if (blocks.length) {
      blocks[blocks.length - 1]?.lines.push(line)
    } else {
      page.push(line)
    }
  }
  return { page, blocks }
}

// a block's leading planning lines and drawers, which Logseq writes
// below the content's first line in either format
function takeMeta(lines: string[], isMeta: (line: string) => boolean) {
  const meta: string[][] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (isDrawerStart(line)) {
      const end = orgElementEnd(lines, i)
      if (end === -1) {
        break
      }
      meta.push(lines.slice(i, end + 1))
      i = end + 1
    } else if (PLANNING_RE.test(line) || isMeta(line)) {
      meta.push([line])
      i++
    } else {
      break
    }
  }
  return { meta, body: lines.slice(i) }
}

// the one org block whose content Logseq md writes as Markdown markup
// (its <quote command), and org→md writes as a md quote
const QUOTE_BLOCK_RE = /^#\+begin_quote\b/i

function convertOrgBlock(
  block: string[],
  convert: FragmentConverter,
  preset: Preset
): string[] {
  if (!QUOTE_BLOCK_RE.test(block[0] ?? "")) {
    return block
  }
  const content = convertContent(block.slice(1, -1), convert, preset)
  return [block[0] ?? "", ...content, block.at(-1) ?? ""]
}

// md→org: a block's org blocks stay as written, as org→md writes them,
// but for a quote's content; the text around them converts
function convertMarkdownContent(
  lines: string[],
  convert: FragmentConverter,
  preset: Preset
): string[] {
  const result: string[] = []
  let text: string[] = []
  let fenced = false
  for (let i = 0; i < lines.length; i++) {
    fenced = FENCE_RE.test(lines[i] ?? "") ? !fenced : fenced
    const end =
      fenced || !isOrgBlockStart(lines[i] ?? "") ? -1 : orgElementEnd(lines, i)
    if (end === -1) {
      text.push(lines[i] ?? "")
      continue
    }
    result.push(
      ...convertContent(text, convert, preset),
      ...convertOrgBlock(lines.slice(i, end + 1), convert, preset)
    )
    text = []
    i = end
  }
  return [...result, ...convertContent(text, convert, preset)]
}

function convertContent(
  lines: string[],
  convert: FragmentConverter,
  preset: Preset
): string[] {
  const content = lines.join("\n")
  return content.trim()
    ? convert(content, preset).replace(/\n+$/, "").split("\n")
    : []
}

function convertPage(
  lines: string[],
  convert: FragmentConverter,
  preset: Preset
): string[] {
  // Logseq ends the page properties with a blank line
  return lines.some(line => line.trim())
    ? [`${convert(lines.join("\n"), preset).replace(/\n+$/, "")}\n`]
    : []
}

// org→md reads a block's bare `_` and `^` as text, as md→org writes
// them without the setting that would say so
function withBracedScripts(lines: string[]): string[] {
  const braced = [BRACED_SCRIPTS_LINE, ...lines]
  return consumesBracedScripts(braced.join("\n")) ? braced : lines
}

// Logseq org: a block's properties drawer, as properties; a heading
// level is one of them, but for content that starts with the drawer
function readOrgBlock({ level, lines }: Lines): Block {
  const [first = "", ...rest] = lines
  const metaFirst = isDrawerStart(first)
  const { meta: groups, body } = takeMeta(metaFirst ? lines : rest, () => false)
  let heading = 0
  const meta = groups.flatMap((group): Meta[] => {
    if (group[0] !== ":PROPERTIES:") {
      return [{ lines: group }]
    }
    return group.slice(1, -1).flatMap(line => {
      const [, key = "", value = ""] = ORG_PROPERTY_RE.exec(line) ?? []
      if (!metaFirst && key === "heading" && /^[1-6]$/.test(value)) {
        heading = Number(value)
        return []
      }
      return [{ key, value }]
    })
  })
  return {
    level,
    heading,
    metaFirst,
    meta,
    content: metaFirst ? body : [first, ...body]
  }
}

function readOrgOutline(org: string): Outline {
  const { page, blocks } = splitBlocks(
    org.replace(/\r?\n$/, "").split(/\r?\n/),
    line => {
      const match = ORG_BLOCK_RE.exec(line)
      return match ? [match[1]?.length ?? 0, match[2] ?? ""] : null
    }
  )
  return { page, blocks: blocks.map(readOrgBlock) }
}

// a continuation line sits two spaces inside its bullet
function dedent(line: string, level: number): string {
  const indent = `${"\t".repeat(level - 1)}  `
  return line.startsWith(indent)
    ? line.slice(indent.length)
    : line.trim()
      ? line
      : ""
}

// `## title`: the heading level and the title
function mdHeading(line: string): [number, string] {
  const match = MD_HEADING_RE.exec(line)
  return match ? [match[1]?.length ?? 0, match[2] ?? ""] : [0, line]
}

function readMarkdownBlock({ level, lines: source }: Lines): Block {
  const [first = "", ...rest] = source
  const lines = [first, ...rest.map(line => dedent(line, level))]
  const metaFirst = MD_PROPERTY_RE.test(first)
  const [heading, titleLine] = metaFirst ? [0, ""] : mdHeading(first)
  const { meta: groups, body } = takeMeta(
    metaFirst ? lines : lines.slice(1),
    line => MD_PROPERTY_RE.test(line)
  )
  const meta = groups.map((group): Meta => {
    const property = MD_PROPERTY_RE.exec(group[0] ?? "")
    return property
      ? { key: property[1] ?? "", value: property[2] ?? "" }
      : { lines: group }
  })
  return {
    level,
    heading,
    metaFirst,
    meta,
    content: metaFirst ? body : [titleLine, ...body]
  }
}

function readMarkdownOutline(markdown: string): Outline {
  const lines = markdown.replace(/\r?\n$/, "").split(/\r?\n/)
  // a leading frontmatter is page content, its `- ` lines yaml items
  const frontmatter = lines.slice(
    0,
    lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0
  )
  let fenced = false
  const { page, blocks } = splitBlocks(
    lines.slice(frontmatter.length),
    line => {
      const match = MD_BLOCK_RE.exec(line)
      // a bullet starts a block, which may open a fence of its own
      fenced = (match ? false : fenced) !== FENCE_RE.test(match?.[2] ?? line)
      if (match) {
        return [(match[1]?.length ?? 0) + 1, match[2] ?? ""]
      }
      // a heading outside the bullets is a top-level block, as Logseq
      // writes a page's first block if it is a heading
      return !fenced && MD_HEADING_RE.test(line) ? [1, line] : null
    }
  )
  return {
    page: [...frontmatter, ...page],
    blocks: blocks.map(readMarkdownBlock)
  }
}

// a block's content's first line, its meta lines, then the rest of the
// content; content that starts with the meta lines keeps them first
function arrange(
  metaFirst: boolean,
  meta: string[],
  content: string[]
): string[] {
  return metaFirst
    ? [...meta, ...content]
    : [content[0] ?? "", ...meta, ...content.slice(1)]
}

function propertyLine({ key, value }: { key: string; value: string }) {
  return `${key}::${value ? ` ${value}` : ""}`
}

function writeMarkdownBlock(block: Block): string {
  const meta = block.meta.flatMap(item =>
    "lines" in item ? logbook(item.lines, "*") : [propertyLine(item)]
  )
  const [title = "", ...more] = arrange(block.metaFirst, meta, block.content)
  const head = ["#".repeat(block.heading), title].filter(Boolean).join(" ")
  const indent = "\t".repeat(block.level - 1)
  return [
    `${indent}-${head ? ` ${head}` : ""}`,
    ...more.map(line => `${indent}  ${line}`)
  ].join("\n")
}

// the meta in org: properties become the property drawer, where the
// first of them was, or below the planning lines
function orgMetaLines(meta: Meta[], heading: number): string[] {
  const properties = heading ? [`:heading: ${heading}`] : []
  const lines: (string | null)[] = []
  for (const item of meta) {
    if ("lines" in item) {
      lines.push(...logbook(item.lines, "-"))
      continue
    }
    if (!lines.includes(null)) {
      lines.push(null)
    }
    properties.push(`:${item.key}:${item.value ? ` ${item.value}` : ""}`)
  }
  if (properties.length && !lines.includes(null)) {
    lines.splice(
      lines.filter(line => PLANNING_RE.test(line ?? "")).length,
      0,
      null
    )
  }
  const drawer = [":PROPERTIES:", ...properties, ":END:"]
  return lines.flatMap(line => (line === null ? drawer : [line]))
}

function writeOrgBlock(block: Block): string {
  const [title = "", ...more] = arrange(
    block.metaFirst,
    orgMetaLines(block.meta, block.heading),
    block.content
  )
  return [
    `${"*".repeat(block.level)}${title ? ` ${title}` : ""}`,
    ...more
  ].join("\n")
}

function writeOutline(
  { page, blocks }: Outline,
  writeBlock: (block: Block) => string
): string {
  return [...page, ...blocks.map(writeBlock)].join("\n").concat("\n")
}

// a block's title is a headline's, which Logseq reads as inline text
// only; converted with the lines below it, it must not read as a list,
// a headline or a fixed-width line, so an escape the core drops keeps
// it text (ADR 0006)
function inlineTitle(block: Block): string[] {
  const [title = "", ...rest] = block.content
  return !block.metaFirst && readsAsLineSyntax(title)
    ? [`${ZERO_WIDTH_SPACE}${title}`, ...rest]
    : block.content
}

// a title written from Markdown text keeps it text with an escape that
// a headline needs none of
function dropTitleEscape(block: Block): Block {
  const [title = "", ...rest] = block.content
  return block.metaFirst || !title.startsWith(ZERO_WIDTH_SPACE)
    ? block
    : { ...block, content: [title.slice(ZERO_WIDTH_SPACE.length), ...rest] }
}

// a task marker Logseq shows as a checkbox (0.10, block-checkbox), and
// the text after it; TODO and DONE are the checkbox's own
const CHECKBOX_MARKER_RE =
  /^(TODO|DONE|NOW|LATER|DOING|IN-PROGRESS|WAIT|WAITING) (.*)$/

// Vanilla Markdown: a task as a task item, marked as Logseq shows it,
// so the marker comes back; CANCELED, shown without one, stays text
function vanillaTitle(title: string): string {
  const [, marker, text] = CHECKBOX_MARKER_RE.exec(title) ?? []
  if (!marker) {
    return title
  }
  if (marker === "DONE") {
    return `[x] ${text}`
  }
  return marker === "TODO" ? `[ ] ${text}` : `[ ] ${marker} ${text}`
}

const PLANNING_ENTRY_RE = /(SCHEDULED|DEADLINE): ([<[][^>\]]*[>\]])/g

// Vanilla Markdown: planning and properties as key:: lines, under the
// org-ism names; a drawer and Logseq's view state have no form there
function vanillaMeta(meta: Meta[], context: ConversionContext): string[] {
  return meta.flatMap(item => {
    if ("key" in item) {
      if (item.key === "collapsed") {
        context.onWarning?.("collapsed is Logseq's view state; dropped")
        return []
      }
      return [propertyLine(item)]
    }
    const [first = ""] = item.lines
    if (isDrawerStart(first)) {
      context.onWarning?.(
        `a ${first.slice(1, -1)} drawer has no Vanilla Markdown form; dropped`
      )
      return []
    }
    return [...first.matchAll(PLANNING_ENTRY_RE)].map(([, key = "", value]) => {
      const canonical = key.toLowerCase()
      return `${context.orgismKeys?.[canonical] ?? canonical}:: ${value}`
    })
  })
}

// a block Logseq shows numbered, as a run of its siblings
function isNumbered(item: Meta): boolean {
  return (
    "key" in item &&
    item.key === "logseq.order-list-type" &&
    item.value === "number"
  )
}

// a written block: a list item, or a heading, which stands apart
interface Written {
  heading: boolean
  text: string
}

function vanillaBlock(
  block: Block,
  indent: string,
  bullet: string,
  context: ConversionContext
): Written {
  const [first = "", ...more] = arrange(
    block.metaFirst,
    vanillaMeta(
      block.meta.filter(item => !isNumbered(item)),
      context
    ),
    block.content
  )
  const hashes = "#".repeat(block.heading)
  // a heading no list holds is a heading of its own
  if (block.heading && !indent) {
    const body = more.length ? `\n\n${more.join("\n")}` : ""
    return { heading: true, text: `${hashes} ${first}${body}` }
  }
  const title = [hashes, vanillaTitle(first)].filter(Boolean).join(" ")
  return {
    heading: false,
    text: [
      `${indent}${bullet}${title ? ` ${title}` : ""}`,
      ...more.map(line =>
        line ? `${indent}${" ".repeat(bullet.length + 1)}${line}` : ""
      )
    ].join("\n")
  }
}

// Vanilla Markdown: a block is a list item, its children nested two
// spaces further in; under a heading block they start a new list
// (ADR 0006)
function writeVanillaMarkdownOutline(
  { page, blocks }: Outline,
  context: ConversionContext
): string {
  // a parent's level, its children's indent and their numbered run
  const parents = [{ level: 0, indent: "", run: 0 }]
  const written = blocks.map(block => {
    while (parents.length > 1 && (parents.at(-1)?.level ?? 0) >= block.level) {
      parents.pop()
    }
    const parent = parents.at(-1) ?? { level: 0, indent: "", run: 0 }
    parent.run = block.meta.some(isNumbered) ? parent.run + 1 : 0
    const bullet = parent.run ? `${parent.run}.` : "-"
    const result = vanillaBlock(block, parent.indent, bullet, context)
    parents.push({
      level: block.level,
      indent: result.heading
        ? ""
        : `${parent.indent}${" ".repeat(bullet.length + 1)}`,
      run: 0
    })
    return result
  })
  const body = written
    .map((block, i) =>
      i && (block.heading || written[i - 1]?.heading)
        ? `\n${block.text}`
        : block.text
    )
    .join("\n")
  return [
    ...page.map(text => text.replace(/\n+$/, "")),
    ...(body ? [body] : [])
  ]
    .join("\n\n")
    .concat("\n")
}

/**
 * Converts a Logseq org page to Markdown, block by block: Logseq's,
 * or Vanilla where the preset is on the input side only.
 * @param org The org page.
 * @param convert The core's fragment converter.
 * @param presets The presets for the page properties and for a block.
 * @param context The side the preset is on.
 * @returns The Markdown page.
 */
export function orgOutlineToMarkdown(
  org: string,
  convert: FragmentConverter,
  presets: Presets,
  context: ConversionContext
): string {
  const { page, blocks } = readOrgOutline(org)
  const vanilla = context.side === "input"
  const pageLines = vanilla ? (presets.vanillaPage?.(page) ?? page) : page
  const convertCarried: FragmentConverter = (fragment, preset) =>
    convert(fragment, preset, vanilla ? presets.vanillaInline : undefined)
  const outline = {
    page: convertPage(pageLines, convertCarried, presets.page),
    blocks: blocks.map(block => ({
      ...block,
      content: convertContent(
        withBracedScripts(vanilla ? inlineTitle(block) : block.content),
        convertCarried,
        presets.block
      )
    }))
  }
  return vanilla
    ? writeVanillaMarkdownOutline(outline, context)
    : writeOutline(outline, writeMarkdownBlock)
}

/**
 * Converts a Logseq Markdown page to Logseq org, block by block.
 * @param markdown The Markdown page.
 * @param convert The core's fragment converter.
 * @param presets The presets for the page properties and for a block.
 * @param context The side the preset is on.
 * @returns The org page.
 */
export function markdownOutlineToOrg(
  markdown: string,
  convert: FragmentConverter,
  presets: Presets,
  context: ConversionContext
): string {
  const vanilla = context.side === "output"
  const { page, blocks } = vanilla
    ? readVanillaMarkdownOutline(markdown, context)
    : readMarkdownOutline(markdown)
  // Vanilla Markdown carries Logseq's syntax as Logseq Markdown writes
  // it; Vanilla org is written as Logseq org, which it is (ADR 0006)
  const convertCarried: FragmentConverter = (fragment, preset) =>
    convert(
      fragment,
      preset,
      context.side === "both" || !preset
        ? undefined
        : vanilla
          ? (presets.vanillaReader?.(preset) ?? preset)
          : preset
    )
  return writeOutline(
    {
      page: convertPage(page, convertCarried, presets.page),
      blocks: blocks.map(block => {
        const converted = {
          ...block,
          content: convertMarkdownContent(
            block.content,
            convertCarried,
            presets.block
          ).filter(line => line !== BRACED_SCRIPTS_LINE)
        }
        return vanilla ? dropTitleEscape(converted) : converted
      })
    },
    writeOrgBlock
  )
}
