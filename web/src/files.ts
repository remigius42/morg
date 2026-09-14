import { formatFromFileName, splitFileName } from "../../src/fileNames.js"
import { normalizes, writesMarkdown, type Direction } from "./convert.js"

/** An opened file; structural, so a test needs no real `File`. */
export interface TextFile {
  name: string
  size: number
  text(): Promise<string>
}

/** Above this, conversion is slow enough to be worth mentioning. */
export const LARGE_FILE_BYTES = 1_000_000

/** Whether an opened file belongs in the config panel rather than the input. */
export function isConfigFile(name: string): boolean {
  return splitFileName(name).extension === "toml"
}

/**
 * Direction an opened file implies. A file name carries a format, not an
 * intent, so it flips the format half and leaves the convert/normalize
 * half alone; an unknown extension changes nothing.
 */
export function directionForFile(name: string, current: Direction): Direction {
  const format = formatFromFileName(name)
  if (!format) {
    return current
  }
  const short = format === "markdown" ? "md" : "org"
  if (normalizes(current)) {
    return `normalize-${short}`
  }
  return short === "md" ? "md-to-org" : "org-to-md"
}

/**
 * Basic-format ISO 8601, local time. The extended format's colons are
 * illegal on Windows and rewritten by the browser's download sanitizer.
 */
function timestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${date}T${time}`
}

/**
 * Name to save the output under, derived from the file that was opened.
 * Content with no source file — pasted, or edited since it was opened —
 * gets a timestamped generic name instead: a paste-convert-save loop
 * over several snippets would otherwise name every output the same.
 * Normalizing keeps the source format, so the name would otherwise match
 * the original exactly and invite saving over it; `.normalized` keeps the
 * two apart.
 */
export function outputFileName(
  source: string | undefined,
  direction: Direction,
  now = new Date()
): string {
  const extension = writesMarkdown(direction) ? "md" : "org"
  const { stem } = splitFileName(source ?? `morg-output-${timestamp(now)}`)
  const infix = normalizes(direction) ? ".normalized" : ""
  return `${stem}${infix}.${extension}`
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
