import { expect, test } from "./baseFixture.js"

test.describe("converter", () => {
  test("converts the demo on load, off the main thread", async ({ page }) => {
    // the worker starts while the page loads, so the listeners go on first.
    // That one was *constructed* proves nothing: construction never throws,
    // and a worker whose module dies on its first line is created, reports
    // an error, and is terminated — after which createRunner() converts on
    // the main thread and paints the very same output. Being terminated is
    // what tells the two apart, and it is the regression the DOM-free
    // entity decoder in web/vite.config.ts exists to prevent.
    const terminated: string[] = []
    page.on("worker", worker =>
      worker.on("close", dead => terminated.push(dead.url()))
    )
    await page.goto("/embed.html")

    await expect(page.locator("#output")).toHaveValue(/# morg demo/)
    expect(terminated).toEqual([])
    expect(page.workers()).toHaveLength(1)
    await expect(page.locator("#warnings")).toBeHidden()
  })

  test("converts what is typed into the input", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#input").fill("* Typed headline\n")

    await expect(page.locator("#output")).toHaveValue("# Typed headline\n")
  })

  test("converts the other way once the direction changes", async ({
    page
  }) => {
    await page.goto("/embed.html")
    await page.locator("#direction").selectOption("md-to-org")
    await page.locator("#input").fill("# Typed headline\n")

    await expect(page.locator("#output")).toHaveValue("* Typed headline\n")
  })

  test("locks copy and download while the config is broken", async ({
    page
  }) => {
    await page.goto("/embed.html")
    await page.locator("#configSection summary").click()
    await page.locator("#config").fill("this is not = valid toml")

    await expect(page.locator("#error")).toBeVisible()
    await expect(page.locator("#copyOutput")).toBeDisabled()
    await expect(page.locator("#downloadOutput")).toBeDisabled()
  })

  test("applies a config snippet and marks the panel", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#configSection summary").click()
    await page.locator("#configSnippet").selectOption("prettier")

    await expect(page.locator("#config")).not.toHaveValue("")
    await expect(page.locator("#configSection summary")).toHaveText(
      "Config (morg.toml), active"
    )
    await expect(page.locator("#error")).toBeHidden()
  })

  test("keeps the form state across a reload", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#direction").selectOption("md-to-org")
    await page.locator("#preset").selectOption("logseq")
    // the state is written on change; give the reload something to find
    await expect(page.locator("#output")).not.toHaveValue("")

    await page.reload()

    await expect(page.locator("#direction")).toHaveValue("md-to-org")
    await expect(page.locator("#preset")).toHaveValue("logseq")
  })

  test("runs the converter embedded in the chrome page", async ({ page }) => {
    await page.goto("/convert.html")
    const form = page.frameLocator(".site-frame")

    await expect(form.locator("#output")).toHaveValue(/# morg demo/)
  })
})
