import { describe, expect, it } from "vitest"
import { fillChrome } from "../../web/chrome.js"

const page = "<!-- chrome:head --><!-- chrome:header --><!-- chrome:footer -->"

describe("fillChrome", () => {
  it("links from a page at the root relative to it", () => {
    const html = fillChrome(page, "/licenses.html")

    expect(html).toContain(`<a href="./">morg</a>`)
    expect(html).toContain(`href="./licenses.html"`)
  })

  it("links from a page in a subfolder up to the root", () => {
    const html = fillChrome(page, "/a/b/page.html")

    expect(html).toContain(`<a href="../../">morg</a>`)
    expect(html).toContain(`href="../../convert.html"`)
  })

  it("marks the page's own nav link current", () => {
    expect(fillChrome(page, "/convert.html")).toContain(
      `href="./convert.html" aria-current="page"`
    )
    // the dev server asks for the landing page as `/`
    expect(fillChrome(page, "/")).toContain(
      `href="./" aria-current="page">morg`
    )
  })

  it("leaves a page without placeholders alone", () => {
    expect(fillChrome("<p>x</p>", "/x.html")).toBe("<p>x</p>")
  })
})
