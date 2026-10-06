import { audit } from "./helpers/accessibility.js"
import { expect, test } from "./baseFixture.js"

test.describe("third-party licenses page", () => {
  test("lists what the converter and the stylesheet bundle", async ({
    page
  }) => {
    await page.goto("/licenses.html")

    // the GPL dependency morg's own license follows from, and the CSS
    // framework, a development dependency the stylesheet bundles
    await expect(
      page
        .locator("#production")
        .getByRole("link", { name: "uniorg", exact: true })
    ).toBeVisible()
    await expect(
      page.locator("#development").getByRole("link", { name: "@picocss/pico" })
    ).toBeVisible()
  })

  test("leaves morg itself off the list", async ({ page }) => {
    await page.goto("/licenses.html")
    await expect(page.locator("#production tr").first()).toBeVisible()

    await expect(
      page.getByRole("link", { name: "@remigius42/morg", exact: true })
    ).toHaveCount(0)
  })

  // the unfolded text is small and on its own background, so both
  // palettes are audited with it showing
  for (const colorScheme of ["light", "dark"] as const) {
    test(`has no violations with a license unfolded in ${colorScheme} mode`, async ({
      page
    }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto("/licenses.html")
      await page.locator("#production summary").first().click()

      const results = await audit(page).analyze()

      expect(results.violations).toEqual([])
    })
  }
})
