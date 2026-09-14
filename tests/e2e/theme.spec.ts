import { expect, test } from "./baseFixture.js"

const root = "html"

test.describe("theme", () => {
  test("follows the OS until a choice is made", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto("/convert.html")

    // no data-theme at all: the stylesheet's own media query decides, so
    // the page keeps following the OS rather than pinning what it saw once
    await expect(page.locator(root)).not.toHaveAttribute("data-theme")
    await expect(page.locator("#themeDark")).toBeDisabled()
  })

  test("carries a chosen theme into the embedded converter", async ({
    page
  }) => {
    await page.goto("/convert.html")

    await page.locator("#themeDark").click()

    await expect(page.locator(root)).toHaveAttribute("data-theme", "dark")
    // the frame is a separate document: it only learns of the choice
    // through the storage event watchThemeChanges() listens for
    await expect(
      page.frameLocator(".site-frame").locator(root)
    ).toHaveAttribute("data-theme", "dark")
  })

  test("keeps the chosen theme across a reload", async ({ page }) => {
    await page.goto("/convert.html")
    await page.locator("#themeDark").click()

    await page.reload()

    // set by the inline script in the head, before the first paint
    await expect(page.locator(root)).toHaveAttribute("data-theme", "dark")
    await expect(page.locator("#themeDark")).toBeDisabled()
    await expect(page.locator("#themeLight")).toBeEnabled()
  })

  test("lets a host page override the embed with ?theme=", async ({ page }) => {
    await page.goto("/embed.html?theme=dark")

    await expect(page.locator(root)).toHaveAttribute("data-theme", "dark")
  })
})
