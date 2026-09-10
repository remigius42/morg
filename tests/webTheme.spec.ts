import { describe, expect, it } from "vitest"
import { resolveTheme } from "../web/src/theme.js"

describe("resolveTheme", () => {
  it("prefers the ?theme= param over the stored choice", () => {
    expect(resolveTheme("dark", "light")).toBe("dark")
  })

  it("falls back to the stored choice", () => {
    expect(resolveTheme(null, "dark")).toBe("dark")
  })

  it("defers to the OS preference when nothing is set", () => {
    expect(resolveTheme(null, null)).toBeUndefined()
  })

  it("ignores invalid values", () => {
    expect(resolveTheme("blue", "loud")).toBeUndefined()
  })
})
