// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest"
import {
  applyTheme,
  initThemeToggle,
  resolveTheme,
  watchThemeChanges
} from "../web/src/theme.js"

const THEME_KEY = "morg-theme"

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  history.replaceState({}, "", "/")
})

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

describe("applyTheme", () => {
  it("applies the ?theme= param to the document", () => {
    history.replaceState({}, "", "/?theme=dark")
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("applies the stored choice without a param", () => {
    localStorage.setItem(THEME_KEY, "light")
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe("light")
  })

  it("removes the override so the OS preference applies", () => {
    document.documentElement.dataset.theme = "dark"
    applyTheme()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})

describe("initThemeToggle", () => {
  function buttons(): [HTMLButtonElement, HTMLButtonElement] {
    const light = document.createElement("button")
    const dark = document.createElement("button")
    return [light, dark]
  }

  it("marks the effective theme's button active and disabled", () => {
    document.documentElement.dataset.theme = "dark"
    const [light, dark] = buttons()
    initThemeToggle(light, dark)
    expect(dark.disabled).toBe(true)
    expect(dark.classList.contains("active")).toBe(true)
    expect(light.disabled).toBe(false)
  })

  it("applies and persists a clicked choice", () => {
    const [light, dark] = buttons()
    initThemeToggle(light, dark)
    dark.click()
    expect(document.documentElement.dataset.theme).toBe("dark")
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")
    expect(dark.disabled).toBe(true)
    light.click()
    expect(document.documentElement.dataset.theme).toBe("light")
    expect(localStorage.getItem(THEME_KEY)).toBe("light")
    expect(light.disabled).toBe(true)
    expect(dark.disabled).toBe(false)
  })

  it("is a no-op without both buttons (pages without a toggle)", () => {
    expect(() => initThemeToggle(null, null)).not.toThrow()
  })
})

describe("watchThemeChanges", () => {
  it("follows theme changes from other same-origin frames", () => {
    watchThemeChanges()
    localStorage.setItem(THEME_KEY, "dark")
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }))
    expect(document.documentElement.dataset.theme).toBe("dark")
  })

  it("ignores unrelated storage keys", () => {
    watchThemeChanges()
    document.documentElement.dataset.theme = "dark"
    localStorage.setItem(THEME_KEY, "light")
    window.dispatchEvent(new StorageEvent("storage", { key: "other" }))
    expect(document.documentElement.dataset.theme).toBe("dark")
  })
})
