import type { Preset } from "./types.js"

/** The presets of a conversion, by side (ADR 0006). */
export interface PresetOptions {
  /** Sets both sides, where a side preset does not. */
  preset?: Preset
  /** The dialect the input is read in. */
  inputPreset?: Preset
  /** The dialect the output is written in. */
  outputPreset?: Preset
}

/** The preset each side resolved to; `undefined` is Vanilla. */
export interface Sides {
  input: Preset | undefined
  output: Preset | undefined
}

type Format = "markdown" | "org"

/**
 * Resolves the preset of each side of a conversion. A side preset must
 * have a dialect for its side's format; `preset` leaves a side it has
 * none for Vanilla (Obsidian writes no org).
 * @param options The conversion's preset options.
 * @param from The input's format.
 * @param to The output's format.
 * @returns The preset per side.
 * @throws If a side preset has no dialect for its side's format, or
 * `preset` names another preset than a side preset.
 */
export function resolveSides(
  options: PresetOptions,
  from: Format,
  to: Format
): Sides {
  for (const key of ["inputPreset", "outputPreset"] as const) {
    const sidePreset = options[key]
    if (
      options.preset &&
      sidePreset &&
      sidePreset.name !== options.preset.name
    ) {
      throw new Error(
        `preset '${options.preset.name}' conflicts with ${key} '${sidePreset.name}'`
      )
    }
  }
  return {
    input: side(options.inputPreset, options.preset, from, "read the input"),
    output: side(options.outputPreset, options.preset, to, "write the output")
  }
}

function side(
  sidePreset: Preset | undefined,
  preset: Preset | undefined,
  format: Format,
  purpose: string
): Preset | undefined {
  if (sidePreset && !sidePreset[format]) {
    throw new Error(
      `Preset '${sidePreset.name}' has no ${format} dialect to ${purpose} in`
    )
  }
  return sidePreset ?? (preset?.[format] ? preset : undefined)
}
