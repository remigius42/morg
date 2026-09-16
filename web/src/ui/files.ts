import { formatFromFileName, splitFileName } from "../../../src/fileNames.js"
import {
  normalizes,
  readsMarkdown,
  writesMarkdown,
  type Direction
} from "../direction.js"

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
 * Whether decoded text came from a file that was never text. A drop is
 * routed by kind rather than by extension — documents worth converting
 * turn up as `README` or `notes.txt`, which the picker's `accept` list
 * does not cover — so the bytes are what is left to go on. UTF-8 decoding
 * marks what it could not read, and neither marker survives in a document
 * a converter should be handed.
 */
export function looksBinary(text: string): boolean {
  // U+FFFD is where TextDecoder gave up on the bytes; a NUL is valid
  // UTF-8 and still says the file was never text to begin with
  return text.includes("\uFFFD") || text.includes("\u0000")
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
 * Whether a direction still reads the format the opened file is in.
 * Once it does not, the name has stopped describing what is being
 * converted — and where the output format matches the source extension,
 * the derived name is the source file itself. An extension that carries
 * no format says nothing either way, so it keeps the name.
 */
export function directionSuitsFile(
  name: string,
  direction: Direction
): boolean {
  const format = formatFromFileName(name)
  if (!format) {
    return true
  }
  return readsMarkdown(direction) === (format === "markdown")
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
 * Notice for a file big enough that the conversion takes visible time.
 * The page stays responsive throughout — the conversion runs in a worker
 * — but the result still keeps the reader waiting, and the round trip
 * through the textarea costs more than the CLI's straight file read.
 * Undefined for ordinary documents.
 */
export function sizeWarning(file: TextFile): string | undefined {
  if (file.size <= LARGE_FILE_BYTES) {
    return undefined
  }
  const megabytes = (file.size / 1_000_000).toFixed(1)
  return `${file.name} is ${megabytes} MB — converting it may take a while. The morg CLI handles large files better.`
}
