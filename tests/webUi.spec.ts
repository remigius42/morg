// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONVERTING_AFTER_MS, DEBOUNCE_MS } from "../web/src/main.js"
import { runConversion } from "../web/src/convert.js"
import type { ConversionRunner } from "../web/src/runner.js"

// Smoke check: the Embed Page markup wired by main.ts converts on input.
function loadEmbedPageBody(): string {
  const html = readFileSync("web/embed.html", "utf8")
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? ""
  return body.replace(/<script[\s\S]*?<\/script>/g, "")
}

/**
 * Replacing the body is not replacing the page: the drag and drop
 * handlers are wired on the document, so without taking them off they
 * outlive the form they were wired for and a later drop is handled twice,
 * once by a set of controls no longer in the page.
 */
const documentListeners: [string, EventListener][] = []

async function setUpPage(runner?: ConversionRunner) {
  for (const [type, listener] of documentListeners.splice(0)) {
    document.removeEventListener(type, listener)
  }
  document.body.innerHTML = loadEmbedPageBody()
  const { init } = await import("../web/src/main.js")
  const original = document.addEventListener.bind(document)
  document.addEventListener = (type: string, listener: EventListener) => {
    documentListeners.push([type, listener])
    original(type, listener)
  }
  try {
    init(runner)
  } finally {
    document.addEventListener = original
  }
  await settle()
}

/**
 * Waits out the input debounce and lets the conversion promise settle.
 * Conversions are asynchronous, so nothing an event triggers has been
 * painted by the time the dispatch returns.
 */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
  await Promise.resolve()
  await Promise.resolve()
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

/** Converts for real, recording the input of every run it is asked for. */
function countingRunner(runs: string[]): ConversionRunner {
  return {
    run: (input, form, config) => {
      runs.push(input)
      return Promise.resolve(runConversion(input, form, config))
    }
  }
}

/**
 * Converts only when let go, so the window while a conversion is in
 * flight — which a real worker has and a synchronous run does not — can
 * be looked at. Each run appends its release to `release`, in order.
 */
function deferredRunner(release: (() => void)[]): ConversionRunner {
  return {
    run: (input, form, config) =>
      new Promise(resolve => {
        release.push(() => {
          resolve(runConversion(input, form, config))
        })
      })
  }
}

/** Drops files on the converter form, as a browser would. */
async function drop(...files: ReturnType<typeof textFile>[]): Promise<void> {
  await dropOn(element("converter"), ...files)
}

async function dropOn(
  target: EventTarget,
  ...files: ReturnType<typeof textFile>[]
): Promise<void> {
  const event = new Event("drop", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", {
    value: { types: ["Files"], files }
  })
  target.dispatchEvent(event)
  // the file reads resolve first, then the conversion they trigger
  await Promise.resolve()
  await Promise.resolve()
  await settle()
}

/** Dispatches a drag event carrying the given `dataTransfer.types`. */
function dragEvent(type: string, target: EventTarget, types: string[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files: [] }
  })
  target.dispatchEvent(event)
  return event
}

// happy-dom has no URL.createObjectURL to spy on, so these are defined
// outright — and undone after every test, or the no-op anchor click and
// the stubbed execCommand would silently outlive the test that wanted them
const undoStubs: (() => void)[] = []

function stub(target: object, key: string, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(target, key)
  undoStubs.push(() => {
    if (original) {
      Object.defineProperty(target, key, original)
    } else {
      delete (target as Record<string, unknown>)[key]
    }
  })
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    writable: true
  })
}

/** Intercepts the object-URL download so nothing touches the disk. */
function captureDownload() {
  let blob: Blob | undefined
  let name = ""
  stub(URL, "createObjectURL", (value: Blob) => {
    blob = value
    return "blob:captured"
  })
  stub(URL, "revokeObjectURL", () => undefined)
  stub(
    HTMLAnchorElement.prototype,
    "click",
    function (this: HTMLAnchorElement) {
      name = this.download
    }
  )
  return {
    name: () => name,
    contents: () => blob?.text() ?? Promise.resolve("")
  }
}

describe("embed page", () => {
  beforeEach(async () => {
    localStorage.clear()
    // the debounce is what the tests step over; the object-URL revoke in
    // downloadOutput also takes a timer, and never firing it is harmless
    vi.useFakeTimers()
    await setUpPage()
  })

  afterEach(() => {
    while (undoStubs.length) undoStubs.pop()?.()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it("swaps the demo a restored direction loaded", async () => {
    // the visitor who left in Markdown mode comes back to the Markdown
    // demo; switching away has to swap it, the same as it would for
    // anyone who never left. A baseline read before the restore compares
    // against the markup's default and leaves the wrong dialect in the
    // box — converted as the other one on the very first interaction
    localStorage.setItem("morg-web", JSON.stringify({ direction: "md-to-org" }))
    await setUpPage()
    expect(element<HTMLTextAreaElement>("input").value).toContain(
      "Paste your Markdown here"
    )

    const direction = element<HTMLSelectElement>("direction")
    direction.value = "org-to-md"
    direction.dispatchEvent(new Event("change", { bubbles: true }))
    expect(element<HTMLTextAreaElement>("input").value).toContain(
      "Paste your Org here"
    )
  })

  it("converts input on typing", async () => {
    const input = element<HTMLTextAreaElement>("input")
    input.value = "* Hello"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(element<HTMLTextAreaElement>("output").value).toBe("# Hello\n")
  })

  it("converts once for a burst of keystrokes", async () => {
    // a full conversion per keystroke is what makes a large document
    // unusable to type into
    const runs: string[] = []
    await setUpPage(countingRunner(runs))
    runs.length = 0 // the load conversion, which is not what is under test
    const input = element<HTMLTextAreaElement>("input")
    for (const value of ["* H", "* He", "* Hello"]) {
      input.value = value
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 4)
    }
    expect(runs).toEqual([])

    await settle()
    expect(runs).toEqual(["* Hello"])
    expect(element<HTMLTextAreaElement>("output").value).toBe("# Hello\n")
  })

  it("keeps a slow earlier conversion from painting over a newer one", async () => {
    // a one-line edit finishes long before the 1 MB document it replaced;
    // letting the older result land would show output for input that is
    // no longer in the box
    const pending: (() => void)[] = []
    await setUpPage(deferredRunner(pending))
    const input = element<HTMLTextAreaElement>("input")
    for (const value of ["* Slow", "* Fast"]) {
      input.value = value
      input.dispatchEvent(new Event("input", { bubbles: true }))
      await settle()
    }

    // the load conversion, then the two edits — resolved newest first
    pending.reverse().forEach(resolve => {
      resolve()
    })
    await settle()
    expect(element<HTMLTextAreaElement>("output").value).toBe("# Fast\n")
  })

  it("will not copy or save output a newer input has orphaned", async () => {
    // off the UI thread the output box keeps the last result while the
    // next one runs. Saving it writes the previous document's conversion
    // under the current document's name — the freeze used to make that
    // impossible by locking the page
    const saved = captureDownload()
    const release: (() => void)[] = []
    await setUpPage(deferredRunner(release))
    release.shift()?.() // the load conversion, so there is output to steal
    await settle()
    expect(element<HTMLButtonElement>("downloadOutput").disabled).toBe(false)

    const input = element<HTMLTextAreaElement>("input")
    input.value = "* An entirely different document"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(element<HTMLButtonElement>("downloadOutput").disabled).toBe(true)
    expect(element<HTMLButtonElement>("copyOutput").disabled).toBe(true)
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toBe("")

    release.shift()?.()
    await settle()
    expect(element<HTMLButtonElement>("downloadOutput").disabled).toBe(false)
    expect(element<HTMLTextAreaElement>("output").value).toBe(
      "# An entirely different document\n"
    )
  })

  it("announces a conversion only once it has run long", async () => {
    // off the UI thread nothing else marks a conversion — the freeze used
    // to be the progress indicator — but an ordinary document converts in
    // milliseconds, and announcing that is a blink on every pause
    const release: (() => void)[] = []
    await setUpPage(deferredRunner(release))
    release.shift()?.() // the load conversion, so the page is at rest
    await settle()
    const converting = element("converting")
    expect(converting.hidden).toBe(true)
    expect(converting.textContent).toMatch(/converting/i)
    // polite: it must not interrupt whatever is being typed
    expect(converting.getAttribute("aria-live")).toBe("polite")

    const input = element<HTMLTextAreaElement>("input")
    input.value = "* Slow"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS) // the run starts here
    await vi.advanceTimersByTimeAsync(CONVERTING_AFTER_MS - 1)
    expect(converting.hidden).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(converting.hidden).toBe(false)

    release.shift()?.()
    await settle()
    expect(converting.hidden).toBe(true)
    expect(element<HTMLTextAreaElement>("output").value).toBe("# Slow\n")
  })

  it("never announces a conversion that beat the delay", async () => {
    // the notice is scheduled on every run, so a run that finishes first
    // has to take its pending announcement down with it
    const release: (() => void)[] = []
    await setUpPage(deferredRunner(release))
    release.shift()?.()
    await settle()

    const input = element<HTMLTextAreaElement>("input")
    input.value = "* Quick"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    release.shift()?.()
    await settle()

    await vi.advanceTimersByTimeAsync(CONVERTING_AFTER_MS * 2)
    expect(element("converting").hidden).toBe(true)
    expect(element<HTMLTextAreaElement>("output").value).toBe("# Quick\n")
  })

  it("recovers from a conversion that never ran", async () => {
    // a conversion can fail to happen at all rather than fail on its
    // input: the worker dies and the chunk its stand-in needs will not
    // load. Nothing comes back to take the Converting notice down, so
    // without this the page is locked for the rest of its life
    const failing: ConversionRunner = {
      run: () => Promise.reject(new Error("chunk gone"))
    }
    await setUpPage(failing)

    expect(element("converting").hidden).toBe(true)
    const error = element<HTMLParagraphElement>("error")
    expect(error.hidden).toBe(false)
    expect(error.textContent).toMatch(/chunk gone/)
    // the run never produced output, so there is still nothing to save
    expect(element<HTMLButtonElement>("copyOutput").disabled).toBe(true)
    expect(element<HTMLButtonElement>("downloadOutput").disabled).toBe(true)
  })

  it("shows config errors", async () => {
    const config = element<HTMLTextAreaElement>("config")
    config.value = "tyop = true"
    config.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    const error = element<HTMLParagraphElement>("error")
    expect(error.hidden).toBe(false)
    expect(error.textContent).toMatch(/tyop/)
  })

  it("inserts a formatter snippet into the config and applies it", () => {
    const snippet = element<HTMLSelectElement>("configSnippet")
    snippet.value = "prettier"
    snippet.dispatchEvent(new Event("change", { bubbles: true }))
    // the snippet lands in the config synchronously; only the output waits
    expect(element<HTMLTextAreaElement>("config").value).toContain(
      'emphasis = "_"'
    )
    expect(element<HTMLSelectElement>("emphasis").value).toBe("_")
    expect(snippet.value).toBe("")
  })

  it("interprets html via the interpretHtml checkbox", async () => {
    const direction = element<HTMLSelectElement>("direction")
    direction.value = "md-to-org"
    direction.dispatchEvent(new Event("change", { bubbles: true }))
    const input = element<HTMLTextAreaElement>("input")
    input.value = "Some <u>underlined</u> text.\n"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    const interpretHtml = element<HTMLInputElement>("interpretHtml")
    interpretHtml.checked = true
    interpretHtml.dispatchEvent(new Event("change", { bubbles: true }))
    await settle()
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

  it("routes a document and a config dropped together", async () => {
    // dropping a note next to its morg.toml is the natural gesture; taking
    // only the first file discards the other silently
    await drop(
      textFile("notes.org", "* Dropped"),
      textFile("morg.toml", 'preset = "obsidian"\n')
    )
    expect(element<HTMLTextAreaElement>("input").value).toBe("* Dropped")
    expect(element<HTMLSelectElement>("preset").value).toBe("obsidian")
  })

  it("reports the files a drop could not use", async () => {
    await drop(
      textFile("notes.org", "* First"),
      textFile("other.org", "* Second"),
      textFile("photo.png", "")
    )
    expect(element<HTMLTextAreaElement>("input").value).toBe("* First")
    const warnings = element<HTMLUListElement>("warnings")
    expect(warnings.hidden).toBe(false)
    expect(warnings.textContent).toMatch(/other\.org/)
    expect(warnings.textContent).toMatch(/photo\.png/)
  })

  it("refuses a dropped file that is not text", async () => {
    // a drop takes any file — documents worth converting turn up as
    // README or notes.txt, which the picker's accept list never covers —
    // so nothing but the bytes says a png is not one of them
    const before = element<HTMLTextAreaElement>("input").value
    await drop(textFile("photo.png", "\uFFFDPNG\u0000"))
    expect(element<HTMLTextAreaElement>("input").value).toBe(before)
    expect(element("warnings").textContent).toMatch(/photo\.png/)
  })

  it("says nothing about the size of a config", async () => {
    // the size warning talks about how long converting will take and
    // points at the CLI for large documents; a config is never converted
    await drop(textFile("morg.toml", 'preset = "obsidian"', 2_000_000))
    expect(element("warnings").textContent).not.toMatch(/morg\.toml/)
  })

  it("reports a file it cannot read", async () => {
    // dropping a folder rejects here; swallowing it makes the drop look
    // like it simply did nothing
    await drop({
      name: "folder",
      size: 0,
      text: () => Promise.reject(new Error("NotFoundError"))
    })
    const error = element<HTMLParagraphElement>("error")
    expect(error.hidden).toBe(false)
    expect(error.textContent).toMatch(/NotFoundError/)
  })

  it("accepts a file dropped anywhere on the page", async () => {
    // the converter form does not cover the viewport; a drop landing in
    // the margin looked like a broken feature
    await dropOn(document.body, textFile("dropped.md", "# Anywhere"))
    expect(element<HTMLTextAreaElement>("input").value).toBe("# Anywhere")
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
    await settle()
    expect(warnings.textContent).not.toMatch(/vault\.org/)
  })

  it("opens a file chosen through the picker", async () => {
    const picker = element<HTMLInputElement>("fileInput")
    Object.defineProperty(picker, "files", {
      value: [textFile("picked.md", "# Picked")],
      configurable: true
    })
    picker.dispatchEvent(new Event("change", { bubbles: true }))
    await settle()
    expect(element<HTMLTextAreaElement>("input").value).toBe("# Picked")
    expect(element<HTMLSelectElement>("direction").value).toBe("md-to-org")
  })

  it("keeps the form buttons from submitting the page", () => {
    // the form has no action; a default type="submit" would reload it
    for (const id of ["openFile", "copyOutput", "downloadOutput"]) {
      expect(element<HTMLButtonElement>(id).type).toBe("button")
    }
  })

  it("wires Copy to the output, and keeps its notice off the error", async () => {
    // how copying itself behaves is tests/webOutputActions.spec.ts; what
    // this needs is that the button reaches it, and that a refusal lands
    // in its own slot — reported as a conversion error it reads as one,
    // and the next run wipes it before it can be acted on
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) }
    })
    stub(document, "execCommand", () => false)
    element<HTMLButtonElement>("copyOutput").click()
    await Promise.resolve()
    await Promise.resolve()
    const notice = element<HTMLParagraphElement>("copyError")
    expect(notice.hidden).toBe(false)
    expect(element<HTMLParagraphElement>("error").hidden).toBe(true)

    const input = element<HTMLTextAreaElement>("input")
    input.value = "* Still there"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    // a conversion rebuilds the warning list; the copy notice is not part
    // of it and must survive
    expect(notice.hidden).toBe(false)
  })

  it("marks an active config without reopening the panel on load", async () => {
    localStorage.setItem(
      "morg-web",
      JSON.stringify({ config: 'preset = "obsidian"' })
    )
    await setUpPage()
    const section = element<HTMLDetailsElement>("configSection")
    // the user collapsed it on purpose; reopening it every load overrides
    // that, but a config in force must still be visible
    expect(section.open).toBe(false)
    expect(section.querySelector("summary")?.textContent).toMatch(/active/)
    expect(element<HTMLSelectElement>("preset").value).toBe("obsidian")
  })

  it("marks and unmarks the config panel as it is edited", () => {
    const config = element<HTMLTextAreaElement>("config")
    const summary =
      element<HTMLDetailsElement>("configSection").querySelector("summary")
    config.value = 'preset = "obsidian"'
    config.dispatchEvent(new Event("input", { bubbles: true }))
    expect(summary?.textContent).toMatch(/active/)

    config.value = ""
    config.dispatchEvent(new Event("input", { bubbles: true }))
    expect(summary?.textContent).not.toMatch(/active/)
  })

  it("disables copy and download while the conversion is failing", async () => {
    // saving here writes an empty file — and under normalize that name is
    // one keystroke away from the source document's own
    const config = element<HTMLTextAreaElement>("config")
    config.value = "tyop = true"
    config.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(element<HTMLButtonElement>("downloadOutput").disabled).toBe(true)
    expect(element<HTMLButtonElement>("copyOutput").disabled).toBe(true)

    config.value = ""
    config.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    expect(element<HTMLButtonElement>("downloadOutput").disabled).toBe(false)
    expect(element<HTMLButtonElement>("copyOutput").disabled).toBe(false)
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

  it("stops using the opened name once the input is replaced", async () => {
    // the name outlived the document it described: convert notes.org,
    // save notes.md, paste something else, save notes.md again — the
    // second save lands on top of the first
    const saved = captureDownload()
    await drop(textFile("notes.org", "* Saved"))
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toBe("notes.md")

    const input = element<HTMLTextAreaElement>("input")
    input.value = "* An entirely different document"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toMatch(/^morg-output-\d{8}T\d{6}\.md$/)
  })

  it("stops using the opened name once the direction no longer fits", async () => {
    // open notes.md and the direction follows it; switch to Org → Markdown
    // and the output is Markdown again, so the derived name is notes.md —
    // the source file, offered for overwriting. Nothing clears the name
    // on the way: the demo swap sets the input in code, which fires no
    // input event
    const saved = captureDownload()
    await drop(textFile("notes.md", "# Saved"))
    const direction = element<HTMLSelectElement>("direction")
    expect(direction.value).toBe("md-to-org")

    direction.value = "org-to-md"
    direction.dispatchEvent(new Event("change", { bubbles: true }))
    await settle()
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toMatch(/^morg-output-\d{8}T\d{6}\.md$/)
  })

  it("keeps the opened name while the direction still reads it", async () => {
    // Markdown → Org and Normalize Markdown both read the file that was
    // opened, so the name still describes what is being converted
    const saved = captureDownload()
    await drop(textFile("notes.md", "# Saved"))
    const direction = element<HTMLSelectElement>("direction")
    direction.value = "normalize-md"
    direction.dispatchEvent(new Event("change", { bubbles: true }))
    await settle()
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toBe("notes.normalized.md")
  })

  it("names a paste-only download generically", () => {
    const saved = captureDownload()
    element<HTMLButtonElement>("downloadOutput").click()
    expect(saved.name()).toMatch(/^morg-output-\d{8}T\d{6}\.md$/)
  })

  it("says a file can be dropped, before any drag starts", () => {
    // the overlay only appears mid-drag, so it cannot teach anyone that
    // dropping is possible in the first place
    expect(element("openFile").parentElement?.textContent).toMatch(/drop/i)
  })

  it("raises a drop zone over the page", () => {
    // how the zone behaves is tests/webDropZone.spec.ts; what this needs
    // is that init wires one at all — the converter markup carries no
    // overlay, so a page without this call has no drop affordance
    dragEvent("dragenter", document.body, ["Files"])
    expect(element("dropOverlay").hidden).toBe(false)
  })

  it("builds no runner for a form already wired", async () => {
    // init is idempotent per form, but the runner was built by a default
    // argument — evaluated before the guard reads it, so a second call
    // started a worker and then walked away from it, leaving it running
    // and unreachable for the life of the page
    const constructed: unknown[] = []
    vi.stubGlobal(
      "Worker",
      class {
        constructor() {
          constructed.push(this)
        }
        addEventListener() {
          // the runner wires message and error handlers
        }
      }
    )
    const { init } = await import("../web/src/main.js")
    init()
    expect(constructed).toEqual([])
  })

  it("wires the page once when it is set up again", async () => {
    // setUpPage replaces the body, but the drag and drop handlers live on
    // the document and survive it, still closed over the controls of a
    // form that is no longer in the page. A drop would be opened twice —
    // two conversions, and the detached form persisting over the live
    // one's settings
    const runs: string[] = []
    await setUpPage(countingRunner(runs))
    await setUpPage(countingRunner(runs))
    runs.length = 0
    await drop(textFile("notes.org", "* Saved"))
    expect(runs).toEqual(["* Saved"])
  })

  it("persists the config in localStorage", () => {
    const config = element<HTMLTextAreaElement>("config")
    config.value = 'preset = "obsidian"'
    config.dispatchEvent(new Event("input", { bubbles: true }))
    // persisting is not debounced — a reload must not lose the last keystroke
    expect(localStorage.getItem("morg-web")).toMatch(/obsidian/)
  })
})
