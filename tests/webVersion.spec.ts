// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { MORG_VERSION, renderVersion } from "../web/src/version.js"

describe("version display", () => {
  it("reports the build-time version", () => {
    // injected by vite/vitest `define` from git describe --tags
    expect(MORG_VERSION).toMatch(/^v\d+\.\d+\.\d+|^[0-9a-f]{7}/)
  })

  it("renders the version into the placeholder element", () => {
    document.body.innerHTML = '<footer><span id="version"></span></footer>'

    renderVersion()

    const element = document.getElementById("version")
    expect(element?.textContent).toBe(MORG_VERSION)
    // a support question starts with "which version" -- make it findable
    expect(element?.title).toMatch(/version/i)
  })

  it("does nothing on a page without the placeholder", () => {
    document.body.innerHTML = "<footer></footer>"

    expect(() => renderVersion()).not.toThrow()
  })
})
