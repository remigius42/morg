import { describe, expect, it } from "vitest"
import {
  directionForFile,
  isConfigFile,
  outputFileName,
  sizeWarning,
  LARGE_FILE_BYTES
} from "../../../web/src/ui/files.js"

describe("directionForFile", () => {
  it("keeps the normalize mode and swaps the format", () => {
    expect(directionForFile("notes.org", "normalize-md")).toBe("normalize-org")
  })

  it("swaps the format of a conversion without normalizing", () => {
    expect(directionForFile("notes.org", "md-to-org")).toBe("org-to-md")
    expect(directionForFile("notes.md", "org-to-md")).toBe("md-to-org")
  })

  it("leaves the direction alone when the format is unknown", () => {
    // a name carries no format here, so inferring one would be a guess
    expect(directionForFile("notes.txt", "org-to-md")).toBe("org-to-md")
    expect(directionForFile("LICENSE", "normalize-md")).toBe("normalize-md")
    // a dotless name is not its own extension
    expect(directionForFile("org", "md-to-org")).toBe("md-to-org")
    // .markdown is deliberately not inferred: the CLI does not accept it
    // either, and the picker still lets you choose one — it just leaves
    // the direction to the user
    expect(directionForFile("notes.markdown", "org-to-md")).toBe("org-to-md")
  })

  it("matches the extension case-insensitively", () => {
    expect(directionForFile("NOTES.ORG", "md-to-org")).toBe("org-to-md")
    expect(directionForFile("notes.MD", "org-to-md")).toBe("md-to-org")
  })

  it("is not fooled by inherited object properties", () => {
    // these once produced directions like "normalize-[object Object]",
    // which blanks the select and fails every later conversion
    expect(directionForFile("notes.constructor", "normalize-md")).toBe(
      "normalize-md"
    )
    expect(directionForFile("notes.__proto__", "org-to-md")).toBe("org-to-md")
  })
})

describe("isConfigFile", () => {
  it("recognizes a toml file, whatever it is named", () => {
    expect(isConfigFile("morg.toml")).toBe(true)
    expect(isConfigFile("my-settings.TOML")).toBe(true)
  })

  it("treats documents as documents", () => {
    expect(isConfigFile("notes.org")).toBe(false)
    expect(isConfigFile("toml")).toBe(false)
  })
})

describe("outputFileName", () => {
  it("swaps the source extension for the output format", () => {
    expect(outputFileName("notes.md", "md-to-org")).toBe("notes.org")
    expect(outputFileName("notes.org", "org-to-md")).toBe("notes.md")
  })

  it("timestamps a generic name so repeated saves cannot collide", () => {
    // a paste-convert-save loop over several snippets would otherwise
    // name every single output morg-output.md
    const at = new Date(2026, 8, 14, 19, 30, 15)
    expect(outputFileName(undefined, "org-to-md", at)).toBe(
      "morg-output-20260914T193015.md"
    )
    expect(outputFileName(undefined, "md-to-org", at)).toBe(
      "morg-output-20260914T193015.org"
    )
    // colons would be illegal on Windows and rewritten by the browser
    expect(outputFileName(undefined, "org-to-md")).not.toMatch(/:/)
  })

  it("appends the extension when the source had none", () => {
    expect(outputFileName("NOTES", "org-to-md")).toBe("NOTES.md")
  })

  it("marks a normalized file rather than reusing the source name", () => {
    // an identical name invites saving over the original, and the browser
    // offers exactly that when the download lands in the source folder
    expect(outputFileName("notes.org", "normalize-org")).toBe(
      "notes.normalized.org"
    )
    expect(outputFileName("notes.md", "normalize-md")).toBe(
      "notes.normalized.md"
    )
    expect(
      outputFileName(undefined, "normalize-org", new Date(2026, 8, 14, 1, 2, 3))
    ).toBe("morg-output-20260914T010203.normalized.org")
  })

  it("keeps a dotfile's name instead of stripping it", () => {
    expect(outputFileName(".hidden", "org-to-md")).toBe(".hidden.md")
    expect(outputFileName(".org", "org-to-md")).toBe(".org.md")
  })
})

describe("sizeWarning", () => {
  it("warns that a large file will take a while", () => {
    const warning = sizeWarning({
      name: "vault.org",
      size: 4_200_000,
      text: () => Promise.resolve("")
    })
    expect(warning).toMatch(/vault\.org/)
    expect(warning).toMatch(/take a while/i)
    // the conversion runs in a worker now; promising a frozen page would
    // describe a UI that no longer exists
    expect(warning).not.toMatch(/unresponsive/i)
  })

  it("stays quiet for an ordinary document", () => {
    expect(
      sizeWarning({
        name: "notes.org",
        size: LARGE_FILE_BYTES,
        text: () => Promise.resolve("")
      })
    ).toBeUndefined()
  })
})
