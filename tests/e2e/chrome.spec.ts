import { expect, test } from "./baseFixture.js"

test.describe("page chrome", () => {
  test("leads from the landing page to the converter", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("link", { name: "Converter" }).first().click()

    await expect(page).toHaveURL(/convert\.html$/)
    await expect(
      page.frameLocator(".site-frame").locator("#input")
    ).toHaveValue(/morg demo/)
  })

  test("stamps every page with the build version", async ({ page }) => {
    // `git describe --tags --always --dirty`, injected at build time; the
    // fallback string is what a build with no git history leaves behind
    for (const url of ["/", "/convert.html", "/embed.html"]) {
      await page.goto(url)
      await expect(page.locator("#version")).not.toBeEmpty()
      await expect(page.locator("#version")).not.toHaveText("unknown")
    }
  })
})
