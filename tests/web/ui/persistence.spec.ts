// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  readState,
  writeState,
  type PersistedState
} from "../../../web/src/ui/persistence.js"

const REMEMBERED: PersistedState = {
  direction: "md-to-org",
  preset: "obsidian",
  useHtml: true,
  interpretHtml: false,
  taskCheckboxes: true,
  style: { bullet: "*" },
  config: 'preset = "obsidian"'
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("remembering the form", () => {
  it("reads back what it wrote", () => {
    writeState(REMEMBERED)
    expect(readState()).toEqual(REMEMBERED)
  })

  it("remembers nothing on a first visit", () => {
    expect(readState()).toEqual({})
  })

  it("replaces the last memory rather than adding to it", () => {
    writeState(REMEMBERED)
    writeState({ direction: "org-to-md" })
    expect(readState()).toEqual({ direction: "org-to-md" })
  })
})

// the entry is hand-editable and outlives the version of the page that
// wrote it, so anything unreadable has to land where a first visit does
describe("a store that will not cooperate", () => {
  it("treats a corrupt entry as nothing remembered", () => {
    localStorage.setItem("morg-web", "{not json")
    expect(readState()).toEqual({})
  })

  it("survives a store that refuses to be read", () => {
    // a cross-origin iframe under storage partitioning throws on access
    // rather than returning null, and an unhandled throw here takes the
    // whole page down before it has wired anything
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      }
    })
    expect(readState()).toEqual({})
  })

  it("loses the memory rather than the page when writing is refused", () => {
    // private mode reports a quota of zero; every keystroke persists, so
    // a throw here would break typing itself
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota exceeded")
      }
    })
    expect(() => writeState(REMEMBERED)).not.toThrow()
  })
})
