import { describe, expect, it } from "vitest"
import { runConversion } from "../web/src/convert.js"

describe("runConversion", () => {
  it("converts markdown to org with defaults", () => {
    const result = runConversion("# Hello", { direction: "md-to-org" })
    expect(result.output).toBe("* Hello\n")
    expect(result.warnings).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it("converts org to markdown", () => {
    const result = runConversion("* Hello", { direction: "org-to-md" })
    expect(result.output).toBe("# Hello\n")
  })

  it("reports an unknown direction instead of succeeding emptily", () => {
    // reachable from a stale or hand-edited localStorage entry
    const result = runConversion("# Hello", {
      direction: "bogus" as never
    })
    expect(result.error).toMatch(/direction/i)
    expect(result.output).toBe("")
  })

  it("collects warnings for dropped constructs", () => {
    const result = runConversion('![alt](img.png "title")', {
      direction: "md-to-org"
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/title/)
  })

  it("applies a pasted morg.toml", () => {
    const result = runConversion(
      "* Hello /world/",
      { direction: "org-to-md" },
      '[orgToMarkdown.markdownStyle]\nemphasis = "_"\n'
    )
    expect(result.output).toBe("# Hello _world_\n")
  })

  it("reports an invalid config instead of converting", () => {
    const result = runConversion(
      "# Hello",
      { direction: "md-to-org" },
      "not valid = = toml"
    )
    expect(result.error).toMatch(/Invalid config/)
    expect(result.output).toBe("")
  })

  it("rejects unknown config keys", () => {
    const result = runConversion(
      "# Hello",
      { direction: "md-to-org" },
      "tyop = true\n"
    )
    expect(result.error).toMatch(/tyop/)
  })

  it("lets form fields override the pasted config", () => {
    const result = runConversion(
      "* Hello /world/",
      { direction: "org-to-md", markdownStyle: { emphasis: "*" } },
      '[orgToMarkdown.markdownStyle]\nemphasis = "_"\nbullet = "*"\n'
    )
    expect(result.output).toBe("# Hello *world*\n")
  })

  it("applies form-only options", () => {
    const result = runConversion("* TODO buy milk", {
      direction: "org-to-md",
      taskCheckboxes: true
    })
    expect(result.output).toBe("- [ ] buy milk\n")
  })

  it("applies a preset selected in the form", () => {
    const result = runConversion("[[Page|alias]]", {
      direction: "md-to-org",
      preset: "obsidian"
    })
    expect(result.output).toBe("[[Page][alias]]\n")
  })

  it("applies a preset named in the config", () => {
    const result = runConversion(
      "[[Page|alias]]",
      { direction: "md-to-org" },
      'preset = "obsidian"\n'
    )
    expect(result.output).toBe("[[Page][alias]]\n")
  })

  it("reports an unknown preset", () => {
    const result = runConversion("# Hello", {
      direction: "md-to-org",
      preset: "vim"
    })
    expect(result.error).toMatch(/vim/)
    expect(result.output).toBe("")
  })

  it("applies orgismKeys from the config", () => {
    const result = runConversion(
      "* TODO buy milk",
      { direction: "org-to-md" },
      '[orgismKeys]\ntodo = "state"\n'
    )
    expect(result.output).toBe("# buy milk\n\nstate:: TODO\n")
  })

  it("normalizes markdown to canonical form", () => {
    const result = runConversion("* one", { direction: "normalize-md" })
    expect(result.output).toBe("- one\n")
  })

  it("normalizes org to canonical form", () => {
    const result = runConversion("* TODO  Hello", {
      direction: "normalize-org"
    })
    expect(result.output).toBe("* TODO Hello\n")
  })

  it("applies markdown style options when normalizing", () => {
    const result = runConversion("- one", {
      direction: "normalize-md",
      markdownStyle: { bullet: "*" }
    })
    expect(result.output).toBe("* one\n")
  })
})
