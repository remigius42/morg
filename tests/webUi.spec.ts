// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it } from "vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"

// Smoke check: the Embed Page markup wired by main.ts converts on input.
function loadEmbedPageBody(): string {
  const html = readFileSync("web/embed.html", "utf8")
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? ""
  return body.replace(/<script[\s\S]*?<\/script>/g, "")
}

async function setUpPage() {
  document.body.innerHTML = loadEmbedPageBody()
  const { init } = await import("../web/src/main.js")
  init()
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing element #${id}`)
  }
  return found as T
}

describe("embed page", () => {
  beforeEach(async () => {
    localStorage.clear()
    await setUpPage()
  })

  it("preloads a demo and converts it on load", () => {
    const input = element<HTMLTextAreaElement>("input")
    expect(input.value).toContain("Paste your Org here")
    expect(element<HTMLTextAreaElement>("output").value).not.toBe("")
  })

  it("swaps the untouched demo when the direction changes", () => {
    const direction = element<HTMLSelectElement>("direction")
    direction.value = "md-to-org"
    direction.dispatchEvent(new Event("change", { bubbles: true }))
    expect(element<HTMLTextAreaElement>("input").value).toContain(
      "Paste your Markdown here"
    )
  })

  it("converts input on typing", () => {
    const input = element<HTMLTextAreaElement>("input")
    input.value = "* Hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(element<HTMLTextAreaElement>("output").value).toBe("# Hello\n")
  })

  it("shows config errors", () => {
    const config = element<HTMLTextAreaElement>("config")
    config.value = "tyop = true"
    config.dispatchEvent(new Event("input", { bubbles: true }))
    const error = element<HTMLParagraphElement>("error")
    expect(error.hidden).toBe(false)
    expect(error.textContent).toMatch(/tyop/)
  })

  it("inserts a formatter snippet into the config and applies it", () => {
    const snippet = element<HTMLSelectElement>("configSnippet")
    snippet.value = "prettier"
    snippet.dispatchEvent(new Event("change", { bubbles: true }))
    expect(element<HTMLTextAreaElement>("config").value).toContain(
      'emphasis = "_"'
    )
    expect(element<HTMLSelectElement>("emphasis").value).toBe("_")
    expect(snippet.value).toBe("")
  })

  it("interprets html via the interpretHtml checkbox", () => {
    const direction = element<HTMLSelectElement>("direction")
    direction.value = "md-to-org"
    direction.dispatchEvent(new Event("change", { bubbles: true }))
    const input = element<HTMLTextAreaElement>("input")
    input.value = "Some <u>underlined</u> text.\n"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const interpretHtml = element<HTMLInputElement>("interpretHtml")
    interpretHtml.checked = true
    interpretHtml.dispatchEvent(new Event("change", { bubbles: true }))
    expect(element<HTMLTextAreaElement>("output").value).toBe(
      "Some _underlined_ text.\n"
    )
  })

  it("persists the config in localStorage", () => {
    const config = element<HTMLTextAreaElement>("config")
    config.value = 'preset = "obsidian"'
    config.dispatchEvent(new Event("input", { bubbles: true }))
    expect(localStorage.getItem("morg-web")).toMatch(/obsidian/)
  })
})

// the demos are the first thing every visitor converts — pin that they
// round-trip convergently and warning-free under default options
describe("demo documents", () => {
  it("org demo converges without warnings", async () => {
    const { ORG_DEMO } = await import("../web/src/main.js")
    const warnings: string[] = []
    const onWarning = (message: string) => warnings.push(message)
    const md = convertOrgToMarkdown(ORG_DEMO, { onWarning })
    const org = convertMarkdownToOrg(md, { onWarning })
    expect(convertOrgToMarkdown(org, { onWarning })).toBe(md)
    expect(warnings).toEqual([])
  })

  it("md demo is canonical and converges without warnings", async () => {
    const { MD_DEMO } = await import("../web/src/main.js")
    const warnings: string[] = []
    const onWarning = (message: string) => warnings.push(message)
    const org = convertMarkdownToOrg(MD_DEMO, { onWarning })
    expect(convertOrgToMarkdown(org, { onWarning })).toBe(MD_DEMO)
    expect(warnings).toEqual([])
  })
})
