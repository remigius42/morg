import { describe, expect, it } from "vitest"
import { currentSection } from "../../web/src/docsOutline.js"

describe("currentSection", () => {
  it("is none before the first heading reaches the offset", () => {
    expect(currentSection([400, 900], 300, false)).toBe(-1)
  })

  it("is the last heading scrolled past the offset", () => {
    expect(currentSection([-500, 100, 300, 700], 300, false)).toBe(2)
  })

  it("is the last section at the bottom of the page", () => {
    expect(currentSection([-500, 100, 500], 300, true)).toBe(2)
  })
})
