import { writesMarkdown, type Direction } from "./convert.js"

/** An opened file; structural, so a test needs no real `File`. */
export interface TextFile {
  name: string
  size: number
  text(): Promise<string>
}

/** Above this, conversion is slow enough to be worth mentioning. */
export const LARGE_FILE_BYTES = 1_000_000

/** Document formats morg can read, by file extension. */
const DOCUMENT_FORMATS: Record<string, "md" | "org"> = {
  org: "org",
  md: "md",
  markdown: "md"
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  // a dotless name has no extension — "org" is a file, not a format
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase()
}

/** Whether an opened file belongs in the config panel rather than the input. */
export function isConfigFile(name: string): boolean {
  return extensionOf(name) === "toml"
}

/**
 * Direction an opened file implies. A file name carries a format, not an
 * intent, so it flips the format half and leaves the convert/normalize
 * half alone; an unknown extension changes nothing.
 */
export function directionForFile(name: string, current: Direction): Direction {
  const format = DOCUMENT_FORMATS[extensionOf(name)]
  if (!format) {
    return current
  }
  if (current.startsWith("normalize-")) {
    return `normalize-${format}`
  }
  return format === "md" ? "md-to-org" : "org-to-md"
}

/**
 * Name to save the output under, derived from the file that was opened.
 * A paste-only session has no source name and gets a generic one.
 */
export function outputFileName(
  source: string | undefined,
  direction: Direction
): string {
  const extension = writesMarkdown(direction) ? "md" : "org"
  const name = source ?? "morg-output"
  const dot = name.lastIndexOf(".")
  return `${dot === -1 ? name : name.slice(0, dot)}.${extension}`
}

/**
 * Notice for a file big enough to make the UI sluggish — conversion is
 * synchronous and re-runs on every edit. Undefined for ordinary documents.
 */
export function sizeWarning(file: TextFile): string | undefined {
  if (file.size <= LARGE_FILE_BYTES) {
    return undefined
  }
  const megabytes = (file.size / 1_000_000).toFixed(1)
  return `${file.name} is ${megabytes} MB — converting it may be slow or leave the page unresponsive. The morg CLI handles large files better.`
}
