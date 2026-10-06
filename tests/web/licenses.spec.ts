// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { renderNotices, showNotices } from "../../web/src/licenses.js"

let body: HTMLTableSectionElement

beforeEach(() => {
  document.body.innerHTML = "<table><tbody></tbody></table>"
  body = document.querySelector("tbody") as HTMLTableSectionElement
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("licenses page", () => {
  it("lists each package with its version and license, linked to npm", () => {
    renderNotices(body, [
      { name: "@picocss/pico", version: "2.1.1", license: "MIT" }
    ])

    const cells = [...body.querySelectorAll("tr td")].map(
      cell => cell.textContent
    )
    expect(cells).toEqual(["@picocss/pico", "2.1.1", "MIT"])
    expect(body.querySelector("a")?.href).toBe(
      "https://www.npmjs.com/package/@picocss/pico/v/2.1.1"
    )
  })

  it("folds the license text away under the license's name", () => {
    renderNotices(body, [
      {
        name: "yaml",
        version: "2.9.1",
        license: "ISC",
        text: "Copyright Jane Doe <jane@example.com>"
      }
    ])

    const details = body.querySelector("details")
    expect(details?.open).toBe(false)
    expect(details?.querySelector("summary")?.textContent).toBe("ISC")
    const text = details?.querySelector("pre")
    expect(text?.textContent).toBe("Copyright Jane Doe <jane@example.com>")
    // it scrolls within its cell; a keyboard needs focus to do that
    expect(text?.tabIndex).toBe(0)
  })

  it("shows the copyright where a package ships no license text", () => {
    // format declares MIT without a LICENSE file; its copyright line,
    // from the README, is the notice there is
    renderNotices(body, [
      {
        name: "format",
        version: "0.2.2",
        license: "MIT",
        copyright: "Copyright 2010 - 2014 John Doe john@example.com"
      }
    ])

    const license = body.querySelectorAll("td")[2]
    expect(license?.querySelector("details")).toBeNull()
    expect(license?.textContent).toBe(
      "MITCopyright 2010 - 2014 John Doe john@example.com"
    )
  })

  it("loads the list and renders it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json([{ name: "yaml", version: "2.9.1", license: "ISC" }])
        )
      )
    )

    await showNotices(body, "./licenses-production.json")

    expect(fetch).toHaveBeenCalledWith("./licenses-production.json")
    expect(body.querySelector("td")?.textContent).toBe("yaml")
  })

  it("says so in the table when the list cannot be loaded", async () => {
    // the lists are written by scripts/write-licenses.mjs, before a
    // build or the dev server; a page served without them says so
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 404 })))
    )

    await showNotices(body, "./licenses-production.json")

    const cell = body.querySelector("td")
    expect(cell?.colSpan).toBe(3)
    expect(cell?.textContent).toMatch(/could not be loaded/)
  })
})
