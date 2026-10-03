import { consumesBracedScripts } from "../core/bracedScripts.js"
import {
  isDrawerStart,
  isOrgBlockStart,
  orgElementEnd
} from "../core/passthroughSource.js"
import type { FragmentConverter, Preset } from "./types.js"

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
type Meta = { lines: string[] } | { key: string; value: string }

/** A block of the outline, read from either format. */
interface Block {
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
interface Outline {
  page: string[]
  blocks: Block[]
}

interface Presets {
  page: Preset
  block: Preset
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

/**
 * Converts a Logseq org page to Logseq Markdown, block by block.
 * @param org The org page.
 * @param convert The core's fragment converter.
 * @param presets The presets for the page properties and for a block.
 * @returns The Markdown page.
 */
export function orgOutlineToMarkdown(
  org: string,
  convert: FragmentConverter,
  presets: Presets
): string {
  const { page, blocks } = readOrgOutline(org)
  return writeOutline(
    {
      page: convertPage(page, convert, presets.page),
      blocks: blocks.map(block => ({
        ...block,
        content: convertContent(
          withBracedScripts(block.content),
          convert,
          presets.block
        )
      }))
    },
    writeMarkdownBlock
  )
}

/**
 * Converts a Logseq Markdown page to Logseq org, block by block.
 * @param markdown The Markdown page.
 * @param convert The core's fragment converter.
 * @param presets The presets for the page properties and for a block.
 * @returns The org page.
 */
export function markdownOutlineToOrg(
  markdown: string,
  convert: FragmentConverter,
  presets: Presets
): string {
  const { page, blocks } = readMarkdownOutline(markdown)
  return writeOutline(
    {
      page: convertPage(page, convert, presets.page),
      blocks: blocks.map(block => ({
        ...block,
        content: convertMarkdownContent(
          block.content,
          convert,
          presets.block
        ).filter(line => line !== BRACED_SCRIPTS_LINE)
      }))
    },
    writeOrgBlock
  )
}
