// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import {
  MORG_VERSION,
  renderVersion,
  versionParts
} from "../../web/src/version.js"

const CHANGELOG = "https://github.com/remigius42/morg/blob/main/CHANGELOG.md"
const COMMIT = "https://github.com/remigius42/morg/commit"

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

  it("opens its links in a new tab, since the embed runs in an iframe", () => {
    document.body.innerHTML = '<footer><span id="version"></span></footer>'

    renderVersion()

    const links = document.querySelectorAll("#version a")
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank")
      expect(link.getAttribute("rel")).toBe("noopener noreferrer")
      // the link text is "v0.3.0" or "g0a1b2c3" -- meaningless on its own
      expect(link.getAttribute("aria-label")).toMatch(/morg|commit/)
    }
  })
})

describe("versionParts", () => {
  it("links a tagged build to the changelog only", () => {
    expect(versionParts("v0.3.0")).toEqual([
      { text: "v0.3.0", href: CHANGELOG, label: "morg v0.3.0 changelog" }
    ])
  })

  it("links the tag and the commit of a build past the tag", () => {
    expect(versionParts("v0.3.0-3-g0a1b2c3")).toEqual([
      { text: "v0.3.0", href: CHANGELOG, label: "morg v0.3.0 changelog" },
      { text: "-3-" },
      {
        text: "g0a1b2c3",
        href: `${COMMIT}/0a1b2c3`,
        label: "commit 0a1b2c3"
      }
    ])
  })

  it("links the commit of a shallow checkout with no tag in reach", () => {
    expect(versionParts("0a1b2c3")).toEqual([
      { text: "0a1b2c3", href: `${COMMIT}/0a1b2c3`, label: "commit 0a1b2c3" }
    ])
  })

  it("leaves the dirty marker unlinked", () => {
    expect(versionParts("v0.3.0-3-g0a1b2c3-dirty").at(-1)).toEqual({
      text: "-dirty"
    })
    expect(versionParts("v0.3.0-dirty")).toEqual([
      { text: "v0.3.0", href: CHANGELOG, label: "morg v0.3.0 changelog" },
      { text: "-dirty" }
    ])
  })

  it("links a prerelease tag, which carries dashes of its own", () => {
    expect(versionParts("v0.4.0-rc.1-2-g0a1b2c3").at(0)).toEqual({
      text: "v0.4.0-rc.1",
      href: CHANGELOG,
      label: "morg v0.4.0-rc.1 changelog"
    })
  })

  it("leaves a string that is not a version plain", () => {
    // the `unknown` fallback of a build without the define
    expect(versionParts("unknown")).toEqual([{ text: "unknown" }])
  })

  it("restores the input when its parts are concatenated", () => {
    for (const version of [
      "v0.3.0",
      "v0.3.0-3-g0a1b2c3",
      "v0.3.0-3-g0a1b2c3-dirty",
      "0a1b2c3-dirty",
      "unknown"
    ]) {
      expect(
        versionParts(version)
          .map(part => part.text)
          .join("")
      ).toBe(version)
    }
  })
})
