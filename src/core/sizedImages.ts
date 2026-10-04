// An image's size, org's `#+ATTR_HTML: :width 300 :height 200` above an
// image link, spelled in html as `<img src alt width height>` (ADR 0007)

export const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico)$/i

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

/** The `#+ATTR_HTML:` value of a size. */
export function attrHtmlValue(size: ImageSize): string {
  return SIZES.filter(key => size[key] !== undefined)
    .map(key => `:${key} ${size[key]}`)
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
  const sizes = SIZES.filter(key => size[key] !== undefined).map(
    key => ` ${key}="${size[key]}"`
  )
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}"${sizes.join("")}>`
}

const IMG_RE = /^<img((?:\s+[a-z]+="[^"]*")+)\s*\/?>$/i
const ATTRIBUTE_RE = /([a-z]+)="([^"]*)"/gi

const KNOWN: readonly string[] = ["src", "alt", ...SIZES]

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
  const sizes = SIZES.filter(key => values.has(key))
  if (sizes.some(key => !VALUE_RE.test(values.get(key) ?? ""))) {
    return undefined
  }
  return {
    src,
    alt: values.get("alt") ?? "",
    size: Object.fromEntries(sizes.map(key => [key, values.get(key)]))
  }
}
