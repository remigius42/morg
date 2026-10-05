// An image's size, org's `#+ATTR_HTML: :width 300 :height 200` above an
// image link, spelled in html as `<img src alt width height>` (ADR 0007)

import type { Link, Paragraph } from "uniorg"
import type { Parent } from "unist"

export const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

/**
 * Whether an org link's path, without its `::` search option, is an
 * image file's.
 * @param rawLink The link's path.
 * @returns Whether it is an image's.
 */
export function isImagePath(rawLink: string): boolean {
  return IMAGE_EXTENSION_RE.test(rawLink.replace(/::.*$/s, ""))
}

/**
 * A paragraph's lone image link, outside a list item, where org reads no affiliated keyword on the
 * bullet's line and md→org flattens the item's paragraphs.
 * @param paragraph The paragraph.
 * @param parent Its parent.
 * @returns The link, or `undefined`.
 */
export function loneImageLink(
  paragraph: Paragraph,
  parent: Parent
): Link | undefined {
  const [link, ...more] = paragraph.children.filter(
    child => !(child.type === "text" && child.value.trim() === "")
  )
  return parent.type !== "list-item" &&
    !more.length &&
    link?.type === "link" &&
    isImagePath(link.rawLink)
    ? link
    : undefined
}

const SIZES = ["width", "height"] as const

type Size = (typeof SIZES)[number]

export type ImageSize = Partial<Record<Size, string>>

// a value either side holds as one token: no blank, quote or tag
const VALUE = String.raw`[^\s"'<>&]+`
const VALUE_RE = new RegExp(`^${VALUE}$`)
const ATTR_HTML_RE = new RegExp(
  String.raw`^(?::(?:width|height)[ \t]+${VALUE}[ \t]*)+$`
)
const SIZE_RE = new RegExp(String.raw`:(width|height)[ \t]+(${VALUE})`, "g")

/**
 * The size an `#+ATTR_HTML:` value gives an image, if it gives nothing
 * else: each of `:width` and `:height` at most once.
 * @param value The keyword's value.
 * @returns The size, or `undefined`.
 */
export function attrHtmlSize(value: string): ImageSize | undefined {
  if (!ATTR_HTML_RE.test(value.trim())) {
    return undefined
  }
  const size: ImageSize = {}
  for (const [, key, given] of value.matchAll(SIZE_RE)) {
    if (size[key as Size] !== undefined) {
      return undefined
    }
    size[key as Size] = given
  }
  return size
}

/**
 * The size an element's `#+ATTR_HTML:` lines give an image, if there is
 * one line and it gives nothing else.
 * @param attrHtml The element's `ATTR_HTML` affiliated keyword.
 * @returns The size, or `undefined`.
 */
export function loneAttrHtmlSize(attrHtml: unknown): ImageSize | undefined {
  const [value, ...more] = Array.isArray(attrHtml)
    ? (attrHtml as unknown[])
    : []
  return typeof value === "string" && !more.length
    ? attrHtmlSize(value)
    : undefined
}

/** The `#+ATTR_HTML:` value of a size, in the order it was given. */
export function attrHtmlValue(size: ImageSize): string {
  return Object.entries(size)
    .map(([key, value]) => `:${key} ${value}`)
    .join(" ")
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

function unescapeAttribute(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
}

/** An image's html spelling. */
export function imgTag(src: string, alt: string, size: ImageSize): string {
  const sizes = Object.entries(size).map(([key, value]) => ` ${key}="${value}"`)
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${sizes.join("")}>`
}

const IMG_RE = /^<img((?:\s+[a-z]+="[^"]*")+)\s*\/?>$/i
const ATTRIBUTE_RE = /([a-z]+)="([^"]*)"/gi

const KNOWN: readonly string[] = ["src", "alt", ...SIZES]

// the sizes among attribute names, in their order
function sizesIn(names: string[]): Size[] {
  return names.filter((name): name is Size =>
    (SIZES as readonly string[]).includes(name)
  )
}

// an <img>'s attributes, each named once, lower-cased
function imgAttributes(html: string): Map<string, string> | undefined {
  const attributes = IMG_RE.exec(html.trim())?.[1]
  if (attributes === undefined) {
    return undefined
  }
  const values = new Map<string, string>()
  for (const [, name = "", value = ""] of attributes.matchAll(ATTRIBUTE_RE)) {
    const key = name.toLowerCase()
    if (values.has(key)) {
      return undefined
    }
    values.set(key, unescapeAttribute(value))
  }
  return values
}

/**
 * The image a bare `<img>` names, read back from its html spelling: a
 * `src`, an optional `alt`, `width` and `height` as org can hold them,
 * nothing else.
 * @param html The html.
 * @returns The image, or `undefined`.
 */
export function parseImgTag(
  html: string
): { src: string; alt: string; size: ImageSize } | undefined {
  const values = imgAttributes(html)
  const src = values?.get("src")
  if (!values || !src || [...values.keys()].some(key => !KNOWN.includes(key))) {
    return undefined
  }
  const sizes = sizesIn([...values.keys()])
  if (sizes.some(key => !VALUE_RE.test(values.get(key) ?? ""))) {
    return undefined
  }
  return {
    src,
    alt: values.get("alt") ?? "",
    size: Object.fromEntries(sizes.map(key => [key, values.get(key)]))
  }
}
