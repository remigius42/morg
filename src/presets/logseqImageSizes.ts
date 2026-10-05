import type { OrgData, Paragraph, Text } from "uniorg"
import type { Parent } from "unist"
import { visit } from "unist-util-visit"
import {
  attrHtmlSize,
  attrHtmlValue,
  IMAGE_EXTENSION_RE,
  loneImageLink,
  type ImageSize
} from "../core/sizedImages.js"

// Logseq's image size, after the link: `{:height 200, :width 300}`
// (ADR 0007), in org's `#+ATTR_HTML: :height 200 :width 300` elsewhere

const NUMBER = String.raw`\d+(?:\.\d+)?`
const ENTRY = String.raw`:(width|height)\s+(${NUMBER})`
const SIZE_MAP = String.raw`\{\s*${ENTRY}\s*(?:,\s*${ENTRY}\s*)?\}`
const SIZE_MAP_RE = new RegExp(String.raw`^${SIZE_MAP}$`)
const NUMBER_RE = new RegExp(`^${NUMBER}$`)

function parseSizeMap(text: string): ImageSize | undefined {
  const [, key, value, otherKey, otherValue] = SIZE_MAP_RE.exec(text) ?? []
  if (!key || key === otherKey) {
    return undefined
  }
  return otherKey ? { [key]: value, [otherKey]: otherValue } : { [key]: value }
}

function sizeMap(size: ImageSize): string {
  return `{${Object.entries(size)
    .map(([key, value]) => `:${key} ${value}`)
    .join(", ")}}`
}

// the size Logseq spells: numbers only
function logseqSize(attrHtml: unknown): ImageSize | undefined {
  const [value, ...more] = Array.isArray(attrHtml)
    ? (attrHtml as unknown[])
    : []
  const size =
    typeof value === "string" && !more.length ? attrHtmlSize(value) : undefined
  return size && Object.values(size).every(given => NUMBER_RE.test(given))
    ? size
    : undefined
}

/**
 * Logseq's writers: a lone image's `#+ATTR_HTML:` size is its size map.
 * @param uniorgAst A block's tree.
 * @returns The tree.
 */
export function writeSizeMaps(uniorgAst: OrgData): OrgData {
  visit(
    uniorgAst as Parent,
    "paragraph",
    (node: Paragraph, _index: number, parent: Parent) => {
      const link = loneImageLink(node, parent)
      const { ATTR_HTML: attrHtml, ...others } = node.affiliated ?? {}
      const size = logseqSize(attrHtml)
      if (!link || !size) {
        return undefined
      }
      node.children.splice(node.children.indexOf(link) + 1, 0, {
        type: "text",
        value: sizeMap(size)
      } as Text)
      node.affiliated = others
      return undefined
    }
  )
  return uniorgAst
}

// a line of a lone image link in org, and its size map
const IMAGE_LINE_RE = new RegExp(
  String.raw`^(\s*)(\[\[([^\]]+)\](?:\[[^\]]*\])?\])(${SIZE_MAP})?\s*$`
)
const ATTR_HTML_LINE_RE = /^\s*#\+ATTR_HTML:\s+(.*)$/i

function imageLine(line: string | undefined) {
  const [, indent = "", link = "", path = "", map] =
    IMAGE_LINE_RE.exec(line ?? "") ?? []
  return link && IMAGE_EXTENSION_RE.test(path.replace(/::.*$/s, ""))
    ? { indent, link, map }
    : undefined
}

// a line no paragraph continues over: org starts one after it
function ends(line: string | undefined): boolean {
  return line === undefined || !line.trim()
}

// a line below the title that is a paragraph of its own: after the
// title, a blank line, a drawer or keywords, and before a blank line
function alone(lines: string[], i: number): boolean {
  const above = lines[i - 1]
  return (
    i > 0 &&
    ends(lines[i + 1]) &&
    (i === 1 || ends(above) || /^\s*(?::END:|#\+)/i.test(above ?? ""))
  )
}

function attrHtmlLineSize(line: string | undefined): ImageSize | undefined {
  const [, value] = ATTR_HTML_LINE_RE.exec(line ?? "") ?? []
  return value ? logseqSize([value]) : undefined
}

/**
 * Logseq org → Vanilla org, a block's lines below its title: a lone
 * image's size map is its `#+ATTR_HTML:` line.
 * @param lines The block's lines, its title first.
 * @returns The lines.
 */
export function sizeMapsToAttrHtml(lines: string[]): string[] {
  return lines.flatMap((line, i) => {
    const image = imageLine(line)
    const size = image?.map && parseSizeMap(image.map)
    return image && size && alone(lines, i)
      ? [
          `${image.indent}#+ATTR_HTML: ${attrHtmlValue(size)}`,
          image.indent + image.link
        ]
      : [line]
  })
}

/**
 * Vanilla org → Logseq org, a block's lines: a lone image's
 * `#+ATTR_HTML:` size is its size map.
 * @param lines The block's lines, its title first.
 * @returns The lines.
 */
export function attrHtmlToSizeMaps(lines: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const size = attrHtmlLineSize(lines[i])
    const image = imageLine(lines[i + 1])
    if (i && size && image && !image.map && ends(lines[i + 2])) {
      result.push(image.indent + image.link + sizeMap(size))
      i++
    } else {
      result.push(lines[i] ?? "")
    }
  }
  return result
}
