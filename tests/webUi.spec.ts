// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it } from "vitest"

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

  it("converts input on typing", () => {
    const input = element<HTMLTextAreaElement>("input")
    input.value = "# Hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(element<HTMLTextAreaElement>("output").value).toBe("* Hello\n")
  })

  it("shows config errors", () => {
    const config = element<HTMLTextAreaElement>("config")
    config.value = "tyop = true"
    config.dispatchEvent(new Event("input", { bubbles: true }))
    const error = element<HTMLParagraphElement>("error")
    expect(error.hidden).toBe(false)
    expect(error.textContent).toMatch(/tyop/)
  })

  it("persists the config in localStorage", () => {
    const config = element<HTMLTextAreaElement>("config")
    config.value = 'preset = "obsidian"'
    config.dispatchEvent(new Event("input", { bubbles: true }))
    expect(localStorage.getItem("morg-web")).toMatch(/obsidian/)
  })
})
