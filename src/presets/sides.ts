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

/** A document format. */
export type Format = "markdown" | "org"

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
    input: resolveSide(options.inputPreset, options.preset, from, "input"),
    output: resolveSide(options.outputPreset, options.preset, to, "output")
  }
}

/**
 * Resolves one side's preset: the side preset, else `preset` where it
 * has a dialect for the side's format.
 * @param sidePreset The side's own preset, if any.
 * @param preset The preset for both sides, if any.
 * @param format The side's format.
 * @param side Which side it is.
 * @returns The side's preset; `undefined` is Vanilla.
 * @throws If the side preset has no dialect for the format.
 */
export function resolveSide(
  sidePreset: Preset | undefined,
  preset: Preset | undefined,
  format: Format,
  side: "input" | "output"
): Preset | undefined {
  if (sidePreset && !sidePreset[format]) {
    const purpose = side === "input" ? "read the input" : "write the output"
    throw new Error(
      `Preset '${sidePreset.name}' has no ${format} dialect to ${purpose} in`
    )
  }
  return sidePreset ?? (preset?.[format] ? preset : undefined)
}
