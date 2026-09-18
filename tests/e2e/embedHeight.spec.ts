import type { Page } from "@playwright/test"
import { expect, test } from "./baseFixture.js"

/**
 * A host page standing in for a third-party site. It frames the embed
 * page at a deliberately wrong height and records what it is told;
 * `follows` decides whether it then does what the README tells a host
 * to do and applies it.
 *
 * Both halves are needed. A host that stays at its wrong height is the
 * one that can tell a measured height from an echoed one — a frame
 * sized to the content makes a report that merely repeated the frame's
 * height look right. A host that follows is the only one that can tell
 * a height that shrinks from one that ratchets, because a page only
 * measures taller than its content once the frame has been sized down
 * to it.
 */
const hostPage = (follows: boolean): string => `<!doctype html>
<html><body style="margin:0">
<iframe id="frame" src="/embed.html" style="width:900px;height:300px;border:none"></iframe>
<script>
  window.heights = []
  addEventListener("message", event => {
    if (event.data && event.data.type === "morg:height") {
      window.heights.push(event.data.height)
      if (${String(follows)}) {
        document.getElementById("frame").style.height = event.data.height + "px"
      }
    }
  })
</script>
</body></html>`

declare global {
  interface Window {
    heights: number[]
  }
}

/**
 * Serves the host page from the preview server's own origin, so the
 * frame's relative `src` resolves — `setContent` would leave it on
 * `about:blank`, where it does not.
 */
async function openHost(page: Page, follows = false): Promise<void> {
  await page.route("**/embedHostFixture.html", route =>
    route.fulfill({ contentType: "text/html", body: hostPage(follows) })
  )
  await page.goto("/embedHostFixture.html")
}

const lastHeight = () => window.heights.at(-1) ?? 0

test.describe("embed height", () => {
  test("reports the content height to the host frame", async ({ page }) => {
    await openHost(page)

    // the frame is 300px tall, so anything near 300 is the viewport
    // being measured rather than the content
    await expect.poll(() => page.evaluate(lastHeight)).toBeGreaterThan(400)

    const height = await page.evaluate(lastHeight)
    const content = await page
      .frameLocator("#frame")
      .locator("body")
      .evaluate(body => Math.ceil(body.getBoundingClientRect().height))
    expect(height).toBe(content)
  })

  test("reports again when a panel changes the height", async ({ page }) => {
    await openHost(page)
    await expect.poll(() => page.evaluate(lastHeight)).toBeGreaterThan(400)
    const collapsed = await page.evaluate(lastHeight)

    await page.frameLocator("#frame").locator("#options summary").click()

    await expect
      .poll(() => page.evaluate(lastHeight))
      .toBeGreaterThan(collapsed)
  })

  test("asks a host that follows to shrink again", async ({ page }) => {
    await openHost(page, true)
    await expect.poll(() => page.evaluate(lastHeight)).toBeGreaterThan(400)
    const collapsed = await page.evaluate(lastHeight)
    const options = page.frameLocator("#frame").locator("#options summary")

    await options.click()
    await expect
      .poll(() => page.evaluate(lastHeight))
      .toBeGreaterThan(collapsed)
    await options.click()

    // the frame is as tall as the expanded page by now, so a height
    // taken off the viewport rather than off the content would stay
    // there — a frame that can only ever grow
    await expect.poll(() => page.evaluate(lastHeight)).toBe(collapsed)
  })
})
