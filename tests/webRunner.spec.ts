// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { createRunner, synchronousRunner } from "../web/src/runner.js"
import { handle } from "../web/src/worker.js"

describe("worker handle", () => {
  it("converts a request and echoes its id", () => {
    // the worker's own plumbing needs a real Worker; the conversion it
    // wraps does not, and that is where anything can actually go wrong
    expect(
      handle({ id: 7, input: "* Hello", form: { direction: "org-to-md" } })
    ).toEqual({ id: 7, output: "# Hello\n", warnings: [] })
  })

  it("reports a bad config as data rather than throwing", () => {
    // an Error does not survive structured clone, so the worker must not
    // let one escape
    const response = handle({
      id: 1,
      input: "* Hello",
      form: { direction: "org-to-md" },
      config: "tyop = true"
    })
    expect(response.error).toMatch(/tyop/)
    expect(response.output).toBe("")
  })
})

describe("createRunner", () => {
  it("converts in place where there is no Worker", async () => {
    // happy-dom ships none, which is also what a browser that blocks
    // workers looks like — the converter has to keep working either way
    expect(globalThis.Worker).toBeUndefined()
    expect(createRunner()).toBe(synchronousRunner)
    expect(
      await createRunner().run("* Hello", { direction: "org-to-md" })
    ).toEqual({ output: "# Hello\n", warnings: [] })
  })
})
