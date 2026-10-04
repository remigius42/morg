import { describe, it, expect } from "vitest"
import {
  buildConversionOptions,
  resolvePresetOptions
} from "../src/conversionOptions.js"
import { parseConfig } from "../src/config.js"

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

describe("buildConversionOptions", () => {
  const build = (toml: string, overrides = {}) =>
    buildConversionOptions(overrides, parseConfig(toml), {})

  it("sets both Markdown sides from [markdown] (ADR 0007)", () => {
    const { mdToOrgOptions, orgToMdOptions } = build(
      '[markdown]\ndefinitionList = "html"\nunderline = "markdown"\n'
    )

    expect(mdToOrgOptions.interpretHtml).toEqual({
      definitionList: true,
      underline: false
    })
    expect(orgToMdOptions.spelling).toEqual({
      definitionList: "html",
      underline: "markdown"
    })
  })

  it("lets a side section override [markdown]", () => {
    const { mdToOrgOptions, orgToMdOptions } = build(`
[markdown]
underline = "html"
subscript = "html"

[markdown.input.interpretHtml]
underline = false

[markdown.output]
subscript = "markdown"
`)

    expect(mdToOrgOptions.interpretHtml).toEqual({
      underline: false,
      subscript: true
    })
    expect(orgToMdOptions.spelling).toEqual({
      underline: "html",
      subscript: "markdown"
    })
  })

  it("lets an explicit override win over every construct", () => {
    const { mdToOrgOptions, orgToMdOptions } = build(
      '[markdown]\ndefinitionList = "markdown"\n',
      { interpretHtml: true, spelling: "html" }
    )

    expect(mdToOrgOptions.interpretHtml).toBe(true)
    expect(orgToMdOptions.spelling).toBe("html")
  })

  it("takes each side's own options from its section", () => {
    const { mdToOrgOptions, orgToMdOptions } = build(`
[markdown.output]
taskCheckboxes = true

[markdown.output.preserveOrgisms]
drawers = false

[markdown.output.style]
emphasis = "_"

[org.output]
recordMarkdownStyle = true

[org.output.preserveMdisms]
html = false
`)

    expect(mdToOrgOptions).toEqual({
      recordMarkdownStyle: true,
      preserveMdisms: { html: false }
    })
    expect(orgToMdOptions).toEqual({
      taskCheckboxes: true,
      preserveOrgisms: { drawers: false },
      style: { emphasis: "_" }
    })
  })
})
