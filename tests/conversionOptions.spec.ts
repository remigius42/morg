import { describe, it, expect } from "vitest"
import { resolvePresetOptions } from "../src/conversionOptions.js"

const names = (options: ReturnType<typeof resolvePresetOptions>) => ({
  preset: options.preset?.name,
  inputPreset: options.inputPreset?.name,
  outputPreset: options.outputPreset?.name
})

describe("resolvePresetOptions", () => {
  it("lets a higher layer's side preset override a lower one's preset", () => {
    const options = resolvePresetOptions(
      [{ outputPreset: "vanilla" }, { preset: "logseq" }],
      "org",
      "markdown"
    )

    expect(names(options)).toEqual({
      preset: undefined,
      inputPreset: "logseq",
      outputPreset: undefined
    })
  })

  it("rejects preset and another side preset in one layer only", () => {
    expect(() =>
      resolvePresetOptions(
        [{ preset: "logseq", inputPreset: "vanilla" }],
        "org",
        "markdown"
      )
    ).toThrow("preset 'logseq' conflicts with inputPreset 'vanilla'")
    expect(() =>
      resolvePresetOptions(
        [{ inputPreset: "vanilla" }, { preset: "logseq" }],
        "org",
        "markdown"
      )
    ).not.toThrow()
  })

  it("rejects a side preset with no dialect for its format", () => {
    expect(() =>
      resolvePresetOptions([{ inputPreset: "obsidian" }], "org", "markdown")
    ).toThrow("Preset 'obsidian' has no org dialect to read the input in")
    // `preset` leaves such a side Vanilla instead
    expect(
      names(resolvePresetOptions([{ preset: "obsidian" }], "org", "markdown"))
    ).toEqual({
      preset: undefined,
      inputPreset: undefined,
      outputPreset: "obsidian"
    })
  })

  it("normalizes with one preset for both ways of the trip", () => {
    // the trip goes through md, where Obsidian has its dialect
    expect(
      names(resolvePresetOptions([{ preset: "obsidian" }], "org", "org"))
    ).toEqual({
      preset: "obsidian",
      inputPreset: undefined,
      outputPreset: undefined
    })
  })

  it("translates within a format between two presets", () => {
    expect(
      names(
        resolvePresetOptions(
          [{ inputPreset: "logseq" }, { preset: "vanilla" }],
          "markdown",
          "markdown"
        )
      )
    ).toEqual({
      preset: undefined,
      inputPreset: "logseq",
      outputPreset: undefined
    })
  })
})
