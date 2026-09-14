import type { Page } from "@playwright/test"
import { expect, test } from "./baseFixture.js"

/**
 * Chromium only (see playwright.config.ts): reading the system clipboard
 * back needs the permissions API, and asserting that the text arrived is
 * the only thing that tells a working copy from a silent no-op.
 */
test.use({ permissions: ["clipboard-read", "clipboard-write"] })

/**
 * Refuses `writeText` the way an embed without `allow="clipboard-write"`
 * does. Stubbed rather than staged in a real cross-origin frame: the
 * refusal is the fallback's entire input, and it is identical either way.
 * Only `writeText` goes — `readText` still has to answer the assertion.
 */
async function blockTheClipboardApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("blocked"))
    })
  })
}

test.describe("copying the output", () => {
  test("copies through the clipboard API", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#input").fill("* Copy me\n")
    await expect(page.locator("#output")).toHaveValue("# Copy me\n")

    await page.locator("#copyOutput").click()

    await expect(page.locator("#copyError")).toBeHidden()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "# Copy me\n"
    )
  })

  test("falls back to a selection copy when the API is blocked", async ({
    page
  }) => {
    await blockTheClipboardApi(page)
    await page.goto("/embed.html")
    await page.locator("#input").fill("* Copy me anyway\n")
    await expect(page.locator("#output")).toHaveValue("# Copy me anyway\n")

    await page.locator("#copyOutput").click()

    await expect(page.locator("#copyError")).toBeHidden()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "# Copy me anyway\n"
    )
  })

  test("puts the output back as it found it after a fallback", async ({
    page
  }) => {
    await blockTheClipboardApi(page)
    await page.goto("/embed.html")
    await expect(page.locator("#output")).not.toHaveValue("")

    await page.locator("#copyOutput").click()

    // the fallback selects the whole output and drops readonly to do it;
    // leaving either behind hands back a page that is not the one copied from
    const output = page.locator("#output")
    await expect(output).toHaveJSProperty("readOnly", true)
    await expect(output).toHaveJSProperty("selectionStart", 0)
    await expect(output).toHaveJSProperty("selectionEnd", 0)
  })

  test("copies the output of the embedded converter", async ({ page }) => {
    // the iframe carries `allow="clipboard-write"`; without the grant this
    // would take the fallback, which is a different code path entirely
    await page.goto("/convert.html")
    const form = page.frameLocator(".site-frame")
    await form.locator("#input").fill("* Embedded copy\n")
    await expect(form.locator("#output")).toHaveValue("# Embedded copy\n")

    await form.locator("#copyOutput").click()

    await expect(form.locator("#copyError")).toBeHidden()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "# Embedded copy\n"
    )
  })
})
