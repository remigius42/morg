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
    ).toHaveAttribute("aria-current", "location")
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

  test("keep the text to a reading width on a wide screen", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto("/docs/adr/0009-docs-on-the-site.html")
    const ems = await page
      .locator("main p")
      .first()
      .evaluate(p => p.clientWidth / parseFloat(getComputedStyle(p).fontSize))

    expect(ems).toBeLessThanOrEqual(43)
  })

  test("leave the text a readable width beside the outline", async ({
    page
  }) => {
    // Pico's container is 950px here, its type 19px: about 35em
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto("/docs/adr/0009-docs-on-the-site.html")
    const ems = await page
      .locator("main p")
      .first()
      .evaluate(p => p.clientWidth / parseFloat(getComputedStyle(p).fontSize))

    expect(ems).toBeGreaterThanOrEqual(34)
  })

  test("outline the page beside the text, on a wide screen only", async ({
    page
  }) => {
    const outline = page.getByRole("navigation", { name: "On this page" })
    await page.goto("/docs/adr/0009-docs-on-the-site.html")
    await expect(outline).toBeVisible()
    await outline.getByRole("link", { name: "Consequences" }).click()
    await expect(page).toHaveURL(/#consequences$/)

    await page.setViewportSize({ width: 800, height: 900 })
    await expect(outline).toBeHidden()
  })

  test("mark the section being read in the outline", async ({ page }) => {
    const outline = page.getByRole("navigation", { name: "On this page" })
    const current = outline.locator(`[aria-current="location"]`)
    await page.goto("/docs/adr/0009-docs-on-the-site.html")
    await expect(current).toHaveText("Status")

    await page
      .getByRole("heading", { name: "Decision" })
      .evaluate(heading => heading.scrollIntoView())
    await expect(current).toHaveText("Decision")

    await page.keyboard.press("End")
    await expect(current).toHaveText("Consequences")
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
