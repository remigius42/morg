// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { TextFile } from "../../../web/src/ui/files.js"
import { wireDropZone } from "../../../web/src/ui/dropZone.js"

let dropped: TextFile[][]

/**
 * The zone wires the document, not the markup it is given, so its
 * listeners outlive the body they were wired for; a second wiring would
 * otherwise handle every later drop twice.
 */
const documentListeners: [string, EventListener][] = []

function removeWiredListeners(): void {
  for (const [type, listener] of documentListeners.splice(0)) {
    document.removeEventListener(type, listener)
  }
}

beforeEach(() => {
  removeWiredListeners()
  document.body.innerHTML = `<main><textarea id="input"></textarea></main>`
  dropped = []
  const original = document.addEventListener.bind(document)
  document.addEventListener = (type: string, listener: EventListener) => {
    documentListeners.push([type, listener])
    original(type, listener)
  }
  try {
    wireDropZone(files => dropped.push([...files]))
  } finally {
    document.addEventListener = original
  }
})

afterEach(removeWiredListeners)

function textFile(name: string): TextFile {
  return { name, size: 0, text: () => Promise.resolve("") }
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) {
    throw new Error(`Missing element #${id}`)
  }
  return found as T
}

/** Dispatches a drag event carrying the given `dataTransfer.types`. */
function dragEvent(
  type: string,
  target: EventTarget,
  types: string[],
  files: TextFile[] = []
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", { value: { types, files } })
  target.dispatchEvent(event)
  return event
}

describe("routing what lands", () => {
  it("hands over the files a drop carries", () => {
    const file = textFile("notes.org")
    dragEvent("drop", document.body, ["Files"], [file])
    expect(dropped).toEqual([[file]])
  })

  it("ignores a drop carrying no files", () => {
    // a text selection dropped in the margin is not an empty document
    dragEvent("drop", document.body, ["text/plain"])
    expect(dropped).toEqual([])
  })

  it("swallows a file drop that misses the form", () => {
    // the browser default is to navigate to the dropped file, which would
    // replace the converter and discard whatever was typed
    for (const type of ["dragover", "drop"]) {
      const event = dragEvent(type, document.body, ["Files"])
      expect(event.defaultPrevented).toBe(true)
    }
  })

  it("lets a text drag land in the textarea", () => {
    // dragging a selection into the input is a native textarea behavior;
    // cancelling it makes the drag vanish with no feedback
    const input = element<HTMLTextAreaElement>("input")
    for (const type of ["dragover", "drop"]) {
      const event = dragEvent(type, input, ["text/plain"])
      expect(event.defaultPrevented).toBe(false)
    }
  })
})

describe("the overlay", () => {
  it("shows while files are dragged over the page", () => {
    // the whole page is the drop target, so nothing on screen says a drop
    // would do anything, or what the converter accepts
    dragEvent("dragenter", document.body, ["Files"])
    const overlay = element("dropOverlay")
    expect(overlay.hidden).toBe(false)
    expect(overlay.textContent).toMatch(/morg\.toml/)
  })

  it("sits inside the landmark, where landmark navigation reaches it", () => {
    // appended to the body it is skipped entirely; it is fixed-position,
    // so the parent has no say in where it paints
    expect(element("dropOverlay").closest("main")).not.toBeNull()
  })

  it("hides once the files land", () => {
    dragEvent("dragenter", document.body, ["Files"])
    dragEvent("drop", document.body, ["Files"], [textFile("notes.org")])
    expect(element("dropOverlay").hidden).toBe(true)
  })

  it("stays up while the drag crosses child elements", () => {
    // dragleave fires on every boundary inside the page; hiding on the
    // first one makes the overlay flicker away mid-drag
    dragEvent("dragenter", document.body, ["Files"])
    dragEvent("dragenter", element("input"), ["Files"])
    dragEvent("dragleave", document.body, ["Files"])
    expect(element("dropOverlay").hidden).toBe(false)

    dragEvent("dragleave", element("input"), ["Files"])
    expect(element("dropOverlay").hidden).toBe(true)
  })

  it("stays out of the way of a text drag", () => {
    dragEvent("dragenter", element("input"), ["text/plain"])
    expect(element("dropOverlay").hidden).toBe(true)
  })
})
