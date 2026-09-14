import {
  audit,
  converted,
  createAccessibilityTests
} from "./helpers/accessibility.js"
import { expect, test } from "./baseFixture.js"

createAccessibilityTests("/")
createAccessibilityTests("/convert.html", page =>
  converted(page.frameLocator(".site-frame").locator("#output"))
)
createAccessibilityTests("/embed.html", page =>
  converted(page.locator("#output"))
)

/**
 * States the pages only reach after an interaction. They matter more than
 * the resting page does: the notices and the drop overlay are built in
 * JavaScript (web/src/main.ts) rather than marked up, so nothing reviews
 * them alongside the HTML.
 */
test.describe("Accessibility of transient states", () => {
  test("has no violations while an error is showing", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#configSection summary").click()
    await page.locator("#config").fill("this is not = valid toml")
    await expect(page.locator("#error")).toBeVisible()

    const results = await audit(page).analyze()

    expect(results.violations).toEqual([])
  })

  test("has no violations with every panel open", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#options summary").click()
    await page.locator("#configSection summary").click()
    await page.locator("#configSnippet").selectOption("prettier")
    await expect(page.locator("#config")).not.toHaveValue("")

    const results = await audit(page).analyze()

    expect(results.violations).toEqual([])
  })

  test("has no violations with warnings listed", async ({ page }) => {
    await page.goto("/embed.html")
    // only one document can be in force, so the second is named in the
    // warning list rather than dropped on the floor
    const transfer = await page.evaluateHandle(() => {
      const dragged = new DataTransfer()
      dragged.items.add(new File(["* first"], "first.org"))
      dragged.items.add(new File(["* second"], "second.org"))
      return dragged
    })
    await page.dispatchEvent("body", "drop", { dataTransfer: transfer })
    await expect(page.locator("#warnings")).toBeVisible()

    const results = await audit(page).analyze()

    expect(results.violations).toEqual([])
  })

  test("has no violations while the drop overlay is up", async ({ page }) => {
    await page.goto("/embed.html")
    const transfer = await page.evaluateHandle(() => {
      const dragged = new DataTransfer()
      dragged.items.add(new File(["* dragged"], "dragged.org"))
      return dragged
    })
    await page.dispatchEvent("body", "dragenter", { dataTransfer: transfer })
    await expect(page.locator("#dropOverlay")).toBeVisible()

    const results = await audit(page).analyze()

    expect(results.violations).toEqual([])
  })
})
