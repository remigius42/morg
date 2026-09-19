import type { JSHandle, Page } from "@playwright/test"
import { expect, test } from "./baseFixture.js"

/**
 * Builds a drag payload in the page. A drop cannot be faked from the test
 * side: `DataTransfer` is a browser object, and what the page reads off it
 * — `types`, `files` — is what decides whether the drop is handled at all.
 */
function dragging(
  page: Page,
  ...files: { name: string; contents: string }[]
): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(payload => {
    const transfer = new DataTransfer()
    for (const file of payload) {
      transfer.items.add(new File([file.contents], file.name))
    }
    return transfer
  }, files)
}

test.describe("opening files", () => {
  test("opens a picked file and follows its extension", async ({ page }) => {
    await page.goto("/embed.html")

    await page.locator("#fileInput").setInputFiles({
      name: "notes.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Picked headline\n")
    })

    await expect(page.locator("#direction")).toHaveValue("md-to-org")
    await expect(page.locator("#input")).toHaveValue("# Picked headline\n")
    await expect(page.locator("#output")).toHaveValue("* Picked headline\n")
  })

  test("shows the overlay while files are dragged, then opens one", async ({
    page
  }) => {
    await page.goto("/embed.html")
    const transfer = await dragging(page, {
      name: "dropped.org",
      contents: "* Dropped headline\n"
    })

    await page.dispatchEvent("body", "dragenter", { dataTransfer: transfer })
    await expect(page.locator("#dropOverlay")).toBeVisible()

    await page.dispatchEvent("body", "drop", { dataTransfer: transfer })
    await expect(page.locator("#dropOverlay")).toBeHidden()
    await expect(page.locator("#input")).toHaveValue("* Dropped headline\n")
    await expect(page.locator("#output")).toHaveValue("# Dropped headline\n")
  })

  test("routes a dropped toml into the config panel", async ({ page }) => {
    await page.goto("/embed.html")
    const transfer = await dragging(page, {
      name: "morg.toml",
      contents: '[orgToMarkdown.markdownStyle]\nbullet = "+"\n'
    })

    await page.dispatchEvent("body", "drop", { dataTransfer: transfer })

    await expect(page.locator("#configSection")).toHaveAttribute("open", "")
    await expect(page.locator("#configSection summary")).toHaveText(
      "Config (morg.toml), active"
    )
    // the config did not just land in the box, it took effect
    await expect(page.locator("#bullet")).toHaveValue("+")
  })

  test("refuses a dropped file that is not text", async ({ page }) => {
    await page.goto("/embed.html")
    const transfer = await dragging(page, {
      name: "picture.png",
      // a NUL is valid UTF-8 and still says the bytes were never text
      contents: "\u0000\u0001PNG\u0000"
    })

    await page.dispatchEvent("body", "drop", { dataTransfer: transfer })

    await expect(page.locator("#warnings")).toContainText(
      "Ignored picture.png: it does not look like a text file."
    )
  })

  test("names the download after the opened file", async ({ page }) => {
    await page.goto("/embed.html")
    await page.locator("#fileInput").setInputFiles({
      name: "notes.org",
      mimeType: "text/plain",
      buffer: Buffer.from("* Saved headline\n")
    })
    await expect(page.locator("#downloadOutput")).toBeEnabled()

    const saving = page.waitForEvent("download")
    await page.locator("#downloadOutput").click()
    const saved = await saving

    expect(saved.suggestedFilename()).toBe("notes.md")
  })

  test("names a paste-only download generically", async ({ page }) => {
    await page.goto("/embed.html")
    await expect(page.locator("#downloadOutput")).toBeEnabled()

    const saving = page.waitForEvent("download")
    await page.locator("#downloadOutput").click()
    const saved = await saving

    expect(saved.suggestedFilename()).toMatch(/^morg-output-\d{8}T\d{6}\.md$/)
  })
})
