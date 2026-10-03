import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { PRESET_FORMATS } from "../../../web/src/ui/dialects.js"
import { createPreset } from "../../../src/presets/registry.js"

describe("the dialect selects", () => {
  it("know the dialects the registry's presets have", () => {
    for (const [name, formats] of Object.entries(PRESET_FORMATS)) {
      const preset = createPreset(name)
      for (const format of ["markdown", "org"] as const) {
        // Vanilla is no preset, and reads and writes either format
        expect(preset ? Boolean(preset[format]) : true).toBe(
          formats.includes(format)
        )
      }
    }
  })

  it("offer every dialect there is, on either side", () => {
    const dialects = (["org", "markdown"] as const).flatMap(format =>
      Object.entries(PRESET_FORMATS)
        .filter(([, formats]) => formats.includes(format))
        .map(([name]) => (name === "vanilla" ? format : `${format}:${name}`))
    )
    const html = readFileSync("web/embed.html", "utf8")
    for (const side of ["inputDialect", "outputDialect"]) {
      const select = new RegExp(`<select id="${side}"[\\s\\S]*?</select>`).exec(
        html
      )?.[0]
      const values = [...(select ?? "").matchAll(/value="([^"]*)"/g)].map(
        ([, value]) => value
      )
      expect(values).toEqual(dialects)
    }
  })
})
