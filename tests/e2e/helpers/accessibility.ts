import { AxeBuilder } from "@axe-core/playwright"
import type { Locator, Page } from "@playwright/test"
import { expect, test } from "../baseFixture.js"

/**
 * `page-has-heading-one` is axe's only finding the pages will not act on.
 * The converter is the page: embed.html is a fragment meant to be dropped
 * into someone else's document, where an `h1` of morg's own would outrank
 * the host's, and convert.html is that fragment in a frame. Everything
 * else axe reports, best-practice rules included, is treated as a defect.
 */
const DELIBERATE = ["page-has-heading-one"]

/** Audits a page the way every spec here should. */
export function audit(page: Page): AxeBuilder {
  return new AxeBuilder({ page }).disableRules(DELIBERATE)
}

/**
 * Audits a page in both color schemes. Both are scanned because the theme
 * decides every contrast ratio on the page, and morg ships a light and a
 * dark palette (web/src/theme.css) that are chosen independently.
 */
export function createAccessibilityTests(
  url: string,
  /** awaited after navigation, so a page is scanned in its settled form */
  waitForReady: (page: Page) => Promise<void> = () => Promise.resolve()
): void {
  test.describe(`Accessibility of ${url}`, () => {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`has no violations in ${colorScheme} mode`, async ({ page }) => {
        await page.emulateMedia({ colorScheme })
        await page.goto(url)
        await waitForReady(page)
        const results = await audit(page).analyze()
        expect(results.violations).toEqual([])
      })
    }
  })
}

/** Resolves once the form has painted the result of its first conversion. */
export async function converted(output: Locator): Promise<void> {
  await expect(output).not.toHaveValue("")
}
