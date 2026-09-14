// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

function textFile(name: string, contents: string, size?: number) {
  return {
    name,
    size: size ?? contents.length,
    text: () => Promise.resolve(contents)
  }
}

/** Drops a file on the converter form, as a browser would. */
async function drop(...files: ReturnType<typeof textFile>[]): Promise<void> {
  const event = new Event("drop", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", { value: { files } })
  element("converter").dispatchEvent(event)
  await Promise.resolve()
}

/** Intercepts the object-URL download so nothing touches the disk. */
function captureDownload() {
  let blob: Blob | undefined
  let name = ""
  const url = URL as unknown as Record<string, unknown>
  url.createObjectURL = (value: Blob) => {
    blob = value
    return "blob:captured"
  }
  url.revokeObjectURL = () => undefined
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    name = this.download
  }
  return {
    name: () => name,
    contents: () => blob?.text() ?? Promise.resolve("")
  }
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

  it("ignores a persisted direction the select does not offer", async () => {
    localStorage.setItem("morg-web", JSON.stringify({ direction: "bogus" }))
    await setUpPage()
    const direction = element<HTMLSelectElement>("direction")
    expect(direction.value).not.toBe("")
    expect(element<HTMLTextAreaElement>("output").value).not.toBe("")
  })

  it("shows the build version", () => {
    // the embed page is what sits on the host site, so it is where a
    // "which version is this?" question actually comes from
    expect(element("version").textContent).toMatch(/^v\d|^[0-9a-f]{7}/)
  })

  it("opens a dropped document and follows its extension", async () => {
    element<HTMLSelectElement>("direction").value = "normalize-md"
    await drop(textFile("notes.org", "* Dropped"))
    expect(element<HTMLTextAreaElement>("input").value).toBe("* Dropped")
    // the name carries a format, not an intent: normalize mode survives
    expect(element<HTMLSelectElement>("direction").value).toBe("normalize-org")
    expect(element<HTMLTextAreaElement>("output").value).toBe("* Dropped\n")
  })

  it("routes a dropped toml to the config panel and expands it", async () => {
    await drop(
      textFile(
        "morg.toml",
        'preset = "obsidian"\n\n[orgToMarkdown.markdownStyle]\nemphasis = "_"\n'
      )
    )
    const config = element<HTMLTextAreaElement>("config")
    expect(config.value).toMatch(/obsidian/)
    expect(element<HTMLDetailsElement>("configSection").open).toBe(true)
    // the panel is collapsed by default, so a dropped config must announce
    // itself — and it must actually take effect
    expect(element<HTMLSelectElement>("preset").value).toBe("obsidian")
    expect(element<HTMLSelectElement>("emphasis").value).toBe("_")
    expect(element<HTMLTextAreaElement>("input").value).toContain(
      "Paste your Org here"
    )
  })

  it("warns about a large file until the input is edited by hand", async () => {
    await drop(textFile("vault.org", "* Big", 4_200_000))
    const warnings = element<HTMLUListElement>("warnings")
    expect(warnings.hidden).toBe(false)
    expect(warnings.textContent).toMatch(/vault\.org/)

    // convert() rebuilds the list on every keystroke — the notice has to
    // outlive that, but not outlive the document it describes
    const input = element<HTMLTextAreaElement>("input")
    input.value = "* Big edit"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(warnings.textContent).not.toMatch(/vault\.org/)
  })

  it("opens a file chosen through the picker", async () => {
    const picker = element<HTMLInputElement>("fileInput")
    Object.defineProperty(picker, "files", {
      value: [textFile("picked.md", "# Picked")],
      configurable: true
    })
    picker.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
    expect(element<HTMLTextAreaElement>("input").value).toBe("# Picked")
    expect(element<HTMLSelectElement>("direction").value).toBe("md-to-org")
  })

  it("keeps the form buttons from submitting the page", () => {
    // the form has no action; a default type="submit" would reload it
    for (const id of ["openFile", "copyOutput", "downloadOutput"]) {
      expect(element<HTMLButtonElement>(id).type).toBe("button")
    }
  })

  it("copies the output to the clipboard", async () => {
    const copied: string[] = []
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: (text: string) => {
          copied.push(text)
          return Promise.resolve()
        }
      }
    })
    element<HTMLButtonElement>("copyOutput").click()
    await Promise.resolve()
    expect(copied).toEqual([element<HTMLTextAreaElement>("output").value])
    vi.unstubAllGlobals()
  })

  it("falls back to execCommand when the clipboard is blocked", async () => {
    // a cross-origin iframe without allow="clipboard-write" rejects here
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) }
    })
    const commands: string[] = []
    document.execCommand = (command: string) => {
      commands.push(command)
      return true
    }
    element<HTMLButtonElement>("copyOutput").click()
    await Promise.resolve()
    await Promise.resolve()
    expect(commands).toEqual(["copy"])
    vi.unstubAllGlobals()
  })

  it("downloads the output under the opened file's name", async () => {
    const saved = captureDownload()
    await drop(textFile("notes.org", "* Saved"))
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toBe("notes.md")
    expect(await saved.contents()).toBe("* Saved\n".replace("*", "#"))
  })

  it("keeps a normalized download from overwriting its source", async () => {
    const saved = captureDownload()
    element<HTMLSelectElement>("direction").value = "normalize-org"
    await drop(textFile("notes.org", "* Saved"))
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toBe("notes.normalized.org")
  })

  it("names a paste-only download generically", () => {
    const saved = captureDownload()
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toBe("morg-output.md")
  })

  it("swallows a drop that misses the form", () => {
    // the browser default is to navigate to the dropped file, which would
    // replace the converter and discard whatever was typed
    for (const type of ["dragover", "drop"]) {
      const event = new Event(type, { bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
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
