import { consumesBracedScripts } from "../core/bracedScripts.js"
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
const DRAWER_START_RE = /^:[\w-]+:$/
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

interface Block {
  level: number
  lines: string[]
}

interface Presets {
  page: Preset
  block: Preset
}

function splitBlocks(
  lines: string[],
  blockLevel: (line: string) => [number, string] | null
): { page: string[]; blocks: Block[] } {
  const page: string[] = []
  const blocks: Block[] = []
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
    if (DRAWER_START_RE.test(line)) {
      const end = lines.indexOf(":END:", i)
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

// the line that ends the org block `line` opens, as Logseq reads one
// in Markdown too (`#+BEGIN_QUERY`, `#+BEGIN_SRC`)
function orgBlockEnd(lines: string[], start: number): number {
  const name = /^#\+begin_(\S+)/i.exec(lines[start] ?? "")?.[1]?.toLowerCase()
  return name
    ? lines.findIndex(
        (line, i) => i > start && line.trim().toLowerCase() === `#+end_${name}`
      )
    : -1
}

// md→org: a block's org blocks stay as written, the text around them
// converts
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
    const end = fenced ? -1 : orgBlockEnd(lines, i)
    if (end === -1) {
      text.push(lines[i] ?? "")
      continue
    }
    result.push(
      ...convertContent(text, convert, preset),
      ...lines.slice(i, end + 1)
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
  const { page, blocks } = splitBlocks(
    org.replace(/\r?\n$/, "").split(/\r?\n/),
    line => {
      const match = ORG_BLOCK_RE.exec(line)
      return match ? [match[1]?.length ?? 0, match[2] ?? ""] : null
    }
  )
  return [
    ...convertPage(page, convert, presets.page),
    ...blocks.map(block => orgBlockToMarkdown(block, convert, presets.block))
  ]
    .join("\n")
    .concat("\n")
}

// org→md reads a block's bare `_` and `^` as text, as md→org writes
// them without the setting that would say so
function withBracedScripts(lines: string[]): string[] {
  const braced = [BRACED_SCRIPTS_LINE, ...lines]
  return consumesBracedScripts(braced.join("\n")) ? braced : lines
}

function orgBlockToMarkdown(
  block: Block,
  convert: FragmentConverter,
  preset: Preset
): string {
  const [first = "", ...rest] = block.lines
  // content that starts with the block's properties puts their drawer
  // on the headline line; its heading level is then a property too
  const metaFirst = DRAWER_START_RE.test(first)
  const { meta, body } = takeMeta(metaFirst ? block.lines : rest, () => false)
  let heading = ""
  const metaLines = meta.flatMap(lines => {
    if (lines[0] !== ":PROPERTIES:") {
      return logbook(lines, "*")
    }
    return lines.slice(1, -1).flatMap(line => {
      const [, key = "", value = ""] = ORG_PROPERTY_RE.exec(line) ?? []
      if (!metaFirst && key === "heading" && /^[1-6]$/.test(value)) {
        heading = "#".repeat(Number(value))
        return []
      }
      return [`${key}::${value ? ` ${value}` : ""}`]
    })
  })
  const content = convertContent(
    withBracedScripts(metaFirst ? body : [first, ...body]),
    convert,
    preset
  )
  const [title = "", ...more] = arrange(metaFirst, metaLines, content)
  const head = [heading, title].filter(Boolean).join(" ")
  const indent = "\t".repeat(block.level - 1)
  return [
    `${indent}-${head ? ` ${head}` : ""}`,
    ...more.map(line => `${indent}  ${line}`)
  ].join("\n")
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
  let fenced = false
  const { page, blocks } = splitBlocks(
    markdown.replace(/\r?\n$/, "").split(/\r?\n/),
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
  return [
    ...convertPage(page, convert, presets.page),
    ...blocks.map(block => mdBlockToOrg(block, convert, presets.block))
  ]
    .join("\n")
    .concat("\n")
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

// the md meta lines in org: `key::` lines become the property drawer,
// where the first of them was, or below the planning lines
function orgMetaLines(meta: string[][], heading: number): string[] {
  const properties = heading ? [`:heading: ${heading}`] : []
  const lines: (string | null)[] = []
  for (const group of meta) {
    const property = MD_PROPERTY_RE.exec(group[0] ?? "")
    if (!property) {
      lines.push(...logbook(group, "-"))
      continue
    }
    if (!lines.includes(null)) {
      lines.push(null)
    }
    properties.push(`:${property[1]}:${property[2] ? ` ${property[2]}` : ""}`)
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

// `## title`: the heading level and the title
function mdHeading(line: string): [number, string] {
  const match = MD_HEADING_RE.exec(line)
  return match ? [match[1]?.length ?? 0, match[2] ?? ""] : [0, line]
}

function mdBlockToOrg(
  block: Block,
  convert: FragmentConverter,
  preset: Preset
): string {
  const [first = "", ...rest] = block.lines
  const lines = [first, ...rest.map(line => dedent(line, block.level))]
  // content that starts with properties: their drawer opens on the
  // headline line
  const metaFirst = MD_PROPERTY_RE.test(first)
  const [heading, titleLine] = metaFirst ? [0, ""] : mdHeading(first)
  const { meta, body } = takeMeta(metaFirst ? lines : lines.slice(1), line =>
    MD_PROPERTY_RE.test(line)
  )
  const content = convertMarkdownContent(
    metaFirst ? body : [titleLine, ...body],
    convert,
    preset
  ).filter(line => line !== BRACED_SCRIPTS_LINE)
  const [title = "", ...more] = arrange(
    metaFirst,
    orgMetaLines(meta, heading),
    content
  )
  return [
    `${"*".repeat(block.level)}${title ? ` ${title}` : ""}`,
    ...more
  ].join("\n")
}
