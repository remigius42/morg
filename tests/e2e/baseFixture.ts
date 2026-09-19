import { test as base, expect, type Page } from "@playwright/test"

type Guards = {
  noWarningsOrErrorsInConsole: void
  noUncaughtExceptions: void
}

/**
 * The console guards are the point of running these in a browser at all.
 * A conversion worker that throws on startup, the failure
 * web/vite.config.ts's DOM-free entity decoder exists to prevent, leaves
 * a page that still converts, because createRunner() falls back to the
 * main thread. The only trace it leaves is an error in the console, so
 * every spec watches for one rather than each remembering to.
 */
export const test = base.extend<Guards>({
  noWarningsOrErrorsInConsole: [
    async ({ page }: { page: Page }, use) => {
      const messages: { level: string; message: string }[] = []
      page.on("console", message => {
        const level = message.type()
        if (level !== "warning" && level !== "error") {
          return
        }
        const text = message.text()
        // neither page links one and the browser asks unprompted; a 404
        // for it says nothing about the converter
        if (text.includes("favicon.ico")) {
          return
        }
        messages.push({ level, message: text })
      })

      await use()

      expect(messages).toHaveLength(0)
    },
    { auto: true }
  ],
  noUncaughtExceptions: [
    async ({ page }: { page: Page }, use) => {
      const errors: Error[] = []
      page.on("pageerror", error => errors.push(error))

      await use()

      expect(errors).toHaveLength(0)
    },
    { auto: true }
  ]
})

export { expect } from "@playwright/test"
