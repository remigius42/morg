import { formatFromFileName, splitFileName } from "../../src/fileNames.js"
import { writesMarkdown, type Direction } from "./convert.js"

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
  if (current.startsWith("normalize-")) {
    return `normalize-${short}`
  }
  return short === "md" ? "md-to-org" : "org-to-md"
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
  const { stem } = splitFileName(source ?? "morg-output")
  return `${stem}.${extension}`
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
