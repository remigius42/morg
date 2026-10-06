import { expect, test } from "./baseFixture.js"

test.describe("docs pages", () => {
  test("lead from the nav to every page and back", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Docs" }).click()
    await expect(page).toHaveURL(/docs\/index\.html$/)

    await page.getByRole("link", { name: "Mapping reference" }).click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Mapping reference"
    )
    await expect(
      page.locator("header").getByRole("link", { name: "Docs" })
    ).toHaveAttribute("aria-current", "page")
  })

  test("link only to pages and anchors that exist", async ({
    page,
    request
  }) => {
    // every page the index reaches, and every same-site link on those
    await page.goto("/docs/index.html")
    const pages = await page
      .locator("main a")
      .evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href))
    expect(pages.length).toBeGreaterThan(10)

    for (const url of pages) {
      await page.goto(url)
      const targets = await page
        .locator("main a")
        .evaluateAll(links =>
          links
            .map(link => (link as HTMLAnchorElement).href)
            .filter(href => href.startsWith(location.origin))
        )
      for (const target of targets) {
        const { pathname, hash } = new URL(target)
        const response = await request.get(pathname)
        expect(response.status(), `${url} → ${target}`).toBe(200)
        if (hash) {
          const body = await response.text()
          expect(body, `${url} → ${target}`).toContain(
            `id="${decodeURIComponent(hash.slice(1))}"`
          )
        }
      }
    }
  })

  test("color code by the chosen theme, not the OS's", async ({ page }) => {
    // light-plus's and synthwave-84's color for a TOML table name
    const name = page
      .locator(".shiki .line > span")
      .getByText("orgismKeys", { exact: true })
    await page.emulateMedia({ colorScheme: "light" })
    await page.goto("/docs/configuration.html")
    await expect(name).toHaveCSS("color", "rgb(0, 0, 0)")

    await page.locator("#themeDark").click()
    await expect(name).toHaveCSS("color", "rgb(255, 126, 219)")
  })
})
