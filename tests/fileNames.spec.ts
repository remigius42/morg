import { describe, expect, it } from "vitest"
import { formatFromFileName, splitFileName } from "../src/fileNames.js"

describe("splitFileName", () => {
  it("splits a name into stem and lowercased extension", () => {
    expect(splitFileName("notes.org")).toEqual({
      stem: "notes",
      extension: "org"
    })
    expect(splitFileName("NOTES.ORG")).toEqual({
      stem: "NOTES",
      extension: "org"
    })
  })

  it("treats a dotless name as having no extension", () => {
    // "org" is a file called org, not an Org document
    expect(splitFileName("org")).toEqual({ stem: "org", extension: "" })
  })

  it("keeps a dotfile whole", () => {
    // the leading dot starts the name, so stripping it would leave nothing
    expect(splitFileName(".org")).toEqual({ stem: ".org", extension: "" })
    expect(splitFileName(".hidden")).toEqual({
      stem: ".hidden",
      extension: ""
    })
  })

  it("reads the extension from the last path segment", () => {
    // the CLI is given paths, not bare names: a directory called
    // "release.v2" says nothing about the format of the file inside it
    expect(splitFileName("docs/.org")).toEqual({
      stem: "docs/.org",
      extension: ""
    })
    expect(splitFileName("release.v2/notes")).toEqual({
      stem: "release.v2/notes",
      extension: ""
    })
    expect(splitFileName("docs/notes.md")).toEqual({
      stem: "docs/notes",
      extension: "md"
    })
  })

  it("splits on the last dot", () => {
    expect(splitFileName("notes.backup.md")).toEqual({
      stem: "notes.backup",
      extension: "md"
    })
  })
})

describe("formatFromFileName", () => {
  it("recognizes the formats morg reads", () => {
    expect(formatFromFileName("notes.md")).toBe("markdown")
    expect(formatFromFileName("notes.org")).toBe("org")
  })

  it("returns undefined for anything else", () => {
    expect(formatFromFileName("notes.txt")).toBeUndefined()
    expect(formatFromFileName("LICENSE")).toBeUndefined()
    expect(formatFromFileName(".org")).toBeUndefined()
  })

  it("is not fooled by inherited object properties", () => {
    // a plain-object lookup would answer for every Object.prototype key
    expect(formatFromFileName("notes.constructor")).toBeUndefined()
    expect(formatFromFileName("notes.__proto__")).toBeUndefined()
    expect(formatFromFileName("notes.toString")).toBeUndefined()
  })
})
