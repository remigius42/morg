// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  copyOutput,
  downloadOutput
} from "../../../web/src/ui/outputActions.js"

let output: HTMLTextAreaElement
let copyError: HTMLParagraphElement

beforeEach(() => {
  document.body.innerHTML = `
    <textarea id="input"></textarea>
    <textarea id="output" readonly># converted</textarea>
    <p id="copyError" hidden>Could not copy — press Ctrl+C.</p>
  `
  output = element<HTMLTextAreaElement>("output")
  copyError = element<HTMLParagraphElement>("copyError")
})

afterEach(() => {
  while (undoStubs.length) undoStubs.pop()?.()
  vi.unstubAllGlobals()
})

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing element #${id}`)
  }
  return found as T
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

/** Makes the Clipboard API refuse, the way a bare iframe does. */
function blockClipboard(): void {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: () => Promise.reject(new Error("denied")) }
  })
}

describe("copying the output", () => {
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
    await copyOutput(output, copyError)
    expect(copied).toEqual([output.value])
  })

  it("falls back to execCommand when the clipboard is blocked", async () => {
    // a cross-origin iframe without allow="clipboard-write" rejects here
    blockClipboard()
    const commands: string[] = []
    stub(document, "execCommand", (command: string) => {
      commands.push(command)
      return true
    })
    await copyOutput(output, copyError)
    expect(commands).toEqual(["copy"])
    expect(copyError.hidden).toBe(true)
  })

  it("leaves the output readonly after a fallback copy", async () => {
    // iOS Safari refuses to select a readonly textarea, so the attribute
    // comes off to copy — and an output left writable invites editing a
    // result that the next conversion overwrites without warning
    blockClipboard()
    stub(document, "execCommand", () => true)
    await copyOutput(output, copyError)
    expect(output.readOnly).toBe(true)
  })

  it("leaves the caret where it was after a fallback copy", async () => {
    // every Copy click takes this path in an iframe without
    // allow="clipboard-write", and it selects the output to copy it —
    // someone mid-edit would have to click back into the input to type
    blockClipboard()
    stub(document, "execCommand", () => true)
    const input = element<HTMLTextAreaElement>("input")
    input.focus()
    await copyOutput(output, copyError)
    expect(document.activeElement).toBe(input)
  })

  it("says so when copying is refused outright", async () => {
    // iOS Safari rejects the API and returns false from execCommand; with
    // no feedback, "copied" and "did nothing" look identical
    blockClipboard()
    stub(document, "execCommand", () => false)
    await copyOutput(output, copyError)
    expect(copyError.hidden).toBe(false)
    expect(copyError.textContent).toMatch(/Ctrl\+C/)
  })

  it("says so when the selection copy throws rather than refusing", async () => {
    // execCommand is gone in some engines; an unhandled throw here would
    // leave the notice down and the copy looking like it worked
    blockClipboard()
    stub(document, "execCommand", () => {
      throw new Error("unsupported")
    })
    await copyOutput(output, copyError)
    expect(copyError.hidden).toBe(false)
  })

  it("takes the copy instruction down once copying works", async () => {
    blockClipboard()
    stub(document, "execCommand", () => false)
    await copyOutput(output, copyError)
    expect(copyError.hidden).toBe(false)

    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.resolve() }
    })
    await copyOutput(output, copyError)
    expect(copyError.hidden).toBe(true)
  })
})

/** Intercepts the object-URL download so nothing touches the disk. */
function captureDownload() {
  let blob: Blob | undefined
  let revoked = ""
  let anchored = false
  stub(URL, "createObjectURL", (value: Blob) => {
    blob = value
    return "blob:captured"
  })
  stub(URL, "revokeObjectURL", (url: string) => (revoked = url))
  stub(
    HTMLAnchorElement.prototype,
    "click",
    function (this: HTMLAnchorElement) {
      // Firefox ignores a click on an anchor outside the document
      anchored = this.isConnected
    }
  )
  return {
    anchored: () => anchored,
    revoked: () => revoked,
    type: () => blob?.type ?? "",
    contents: () => blob?.text() ?? Promise.resolve("")
  }
}

describe("downloading the output", () => {
  it("saves what is in the output box, as text", async () => {
    const saved = captureDownload()
    downloadOutput(output, "notes.org", "org-to-md")
    expect(await saved.contents()).toBe("# converted")
    expect(saved.type()).toBe("text/plain;charset=utf-8")
  })

  it("names the file after the one that was opened", () => {
    captureDownload()
    const link = trackDownloadName()
    downloadOutput(output, "notes.org", "org-to-md")
    expect(link()).toBe("notes.md")
  })

  it("clicks the anchor while it is in the document", () => {
    // Firefox only acts on a click if the anchor is connected, and the
    // download is silently a no-op otherwise
    const saved = captureDownload()
    downloadOutput(output, undefined, "org-to-md")
    expect(saved.anchored()).toBe(true)
    expect(document.querySelector("a")).toBeNull()
  })

  it("revokes the object URL out of the click's own task", async () => {
    // revoking in the same task can invalidate the blob before the
    // download task has read it
    vi.useFakeTimers()
    const saved = captureDownload()
    downloadOutput(output, undefined, "org-to-md")
    expect(saved.revoked()).toBe("")
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.revoked()).toBe("blob:captured")
    vi.useRealTimers()
  })
})

/** The name the anchor was given, which it takes with it when removed. */
function trackDownloadName(): () => string {
  let name = ""
  stub(
    HTMLAnchorElement.prototype,
    "click",
    function (this: HTMLAnchorElement) {
      name = this.download
    }
  )
  return () => name
}
