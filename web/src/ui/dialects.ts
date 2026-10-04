/**
 * The two dialect selects, one per side of the conversion (ADR 0006):
 * each names a format and the preset whose dialect of it is meant, and
 * the direction follows from the two; the same on both sides normalizes,
 * two of one format translate.
 * Free of the pipeline, since the main bundle reads it on every change.
 */
import { normalizes, readsMarkdown, type Direction } from "../direction.js"

type Format = "markdown" | "org"

/**
 * The formats each preset has a dialect for: the registry's, kept apart
 * from it so the main bundle stays free of the pipeline; a test pins the
 * two together, and the selects' options to both.
 */
export const PRESET_FORMATS: Record<string, readonly Format[]> = {
  vanilla: ["markdown", "org"],
  logseq: ["markdown", "org"],
  obsidian: ["markdown"]
}

/** A side's format and the preset whose dialect of it is meant. */
interface Dialect {
  format: Format
  preset: string
}

/** The controls the dialect rules touch. */
export interface DialectControls {
  inputDialect: HTMLSelectElement
  outputDialect: HTMLSelectElement
  normalizeHint: HTMLElement
}

// an option's value: the format, then the preset unless it is Vanilla
function parse(value: string): Dialect {
  const [format, preset = "vanilla"] = value.split(":")
  return { format: format === "markdown" ? "markdown" : "org", preset }
}

function valueOf({ format, preset }: Dialect): string {
  return preset === "vanilla" ? format : `${format}:${preset}`
}

// the dialect in a format, the preset's where it has one, else Vanilla's
function inFormat(preset: string, format: Format): string {
  return valueOf({
    format,
    preset: PRESET_FORMATS[preset]?.includes(format) ? preset : "vanilla"
  })
}

function other(format: Format): Format {
  return format === "markdown" ? "org" : "markdown"
}

/** The direction the two sides make. */
export function directionOf(controls: DialectControls): Direction {
  const input = parse(controls.inputDialect.value).format
  const output = parse(controls.outputDialect.value).format
  if (input === output) {
    return input === "markdown" ? "normalize-md" : "normalize-org"
  }
  return input === "markdown" ? "md-to-org" : "org-to-md"
}

/** The preset of each side, by name. */
export function presetsOf(controls: DialectControls): {
  inputPreset: string
  outputPreset: string
} {
  return {
    inputPreset: parse(controls.inputDialect.value).preset,
    outputPreset: parse(controls.outputDialect.value).preset
  }
}

/**
 * Brings the output in line with the input: an input that moved into the
 * output's format, or onto its dialect, moves the output to the other
 * format, keeping its preset where it has a dialect there, as converting
 * is the likelier intent; a dialect picked within one format translates.
 * @param controls The selects and the normalize hint.
 * @param inputMoved Whether the input was just changed.
 */
export function enforceOutput(
  controls: DialectControls,
  inputMoved = false
): void {
  const input = parse(controls.inputDialect.value)
  const output = parse(controls.outputDialect.value)
  const formatChanged = controls.inputDialect.dataset.format !== input.format
  if (
    inputMoved &&
    output.format === input.format &&
    (formatChanged ||
      controls.inputDialect.value === controls.outputDialect.value)
  ) {
    controls.outputDialect.value = inFormat(output.preset, other(input.format))
  }
  controls.inputDialect.dataset.format = input.format
  controls.normalizeHint.hidden =
    controls.inputDialect.value !== controls.outputDialect.value
}

/**
 * Swaps the two sides, so a conversion's way back is one click.
 * @param controls The selects and the normalize hint.
 */
export function swapSides(controls: DialectControls): void {
  const input = controls.inputDialect.value
  controls.inputDialect.value = controls.outputDialect.value
  controls.outputDialect.value = input
  enforceOutput(controls)
}

/**
 * Sets the sides to a direction, each keeping its preset where it has a
 * dialect in the side's new format: an opened file's, or one a visitor
 * left with before the selects named the dialects.
 * @param controls The selects and the normalize hint.
 * @param direction The direction to take.
 * @param presets The presets to keep, by default the sides' own.
 */
export function setDirection(
  controls: DialectControls,
  direction: Direction,
  presets = presetsOf(controls)
): void {
  const from: Format = readsMarkdown(direction) ? "markdown" : "org"
  controls.inputDialect.value = inFormat(presets.inputPreset, from)
  // one format on both sides: normalizing, or translating between two
  controls.outputDialect.value = inFormat(
    presets.outputPreset,
    normalizes(direction) ? from : other(from)
  )
  enforceOutput(controls)
}

/**
 * Sets a side's preset, keeping its format; Vanilla where the preset has
 * no dialect in it.
 * @param select The side's select.
 * @param preset The preset's name.
 */
export function setPreset(select: HTMLSelectElement, preset: string): void {
  select.value = inFormat(preset, parse(select.value).format)
}
