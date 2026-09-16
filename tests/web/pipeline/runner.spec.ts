// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createRunner,
  synchronousRunner
} from "../../../web/src/pipeline/runner.js"
import { handle } from "../../../web/src/pipeline/worker.js"
import type { WorkerRequest } from "../../../web/src/pipeline/workerProtocol.js"

type Listener = (event: { data: unknown }) => void

/**
 * Stands in for the browser's `Worker`, which happy-dom does not have.
 * Converts with the worker's own handler, one microtask later, so the
 * runner's request/response correlation is exercised rather than assumed.
 */
class FakeWorker {
  static constructed: FakeWorker[] = []
  listeners: Record<string, Listener[]> = {}
  terminated = false
  url: URL

  constructor(url: URL) {
    this.url = url
    FakeWorker.constructed.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    ;(this.listeners[type] ??= []).push(listener)
  }

  postMessage(data: WorkerRequest): void {
    queueMicrotask(() => this.emit("message", handle(data)))
  }

  emit(type: string, data?: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener({ data })
    }
  }

  terminate(): void {
    this.terminated = true
  }
}

function useFakeWorker(): typeof FakeWorker {
  FakeWorker.constructed = []
  vi.stubGlobal("Worker", FakeWorker)
  return FakeWorker
}

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it("converts in the worker where there is one", async () => {
    // nothing else pins that the worker is still wired up: knip treats
    // `worker.ts` as an entry by its name, so orphaning it is silent, and
    // every other test runs on the fallback because happy-dom has no
    // Worker. Drop the `new Worker(...)` and this is what notices
    const worker = useFakeWorker()
    const runner = createRunner()
    expect(runner).not.toBe(synchronousRunner)
    // Vite rewrites the URL it recognizes (…?worker_file&type=module), so
    // the path is the part worth asserting on
    expect(worker.constructed[0]?.url.pathname).toMatch(
      /web\/src\/pipeline\/worker\.ts$/
    )
    expect(await runner.run("* Hello", { direction: "org-to-md" })).toEqual({
      output: "# Hello\n",
      warnings: []
    })
  })

  it("answers each request with its own result", async () => {
    // responses come back in whatever order the worker finishes them, so
    // a runner that matched them up by arrival would cross the wires
    useFakeWorker()
    const runner = createRunner()
    const [first, second] = await Promise.all([
      runner.run("* One", { direction: "org-to-md" }),
      runner.run("* Two", { direction: "org-to-md" })
    ])
    expect(first?.output).toBe("# One\n")
    expect(second?.output).toBe("# Two\n")
  })

  it("reports a request the worker will not take", async () => {
    // postMessage throws on a value structured clone cannot carry; the
    // caller has to hear about it rather than wait out a request that was
    // never sent
    const worker = useFakeWorker()
    const runner = createRunner()
    const instance = worker.constructed[0]
    if (instance) {
      instance.postMessage = () => {
        throw new Error("DataCloneError")
      }
    }
    await expect(
      runner.run("* Hello", { direction: "org-to-md" })
    ).rejects.toThrow("DataCloneError")
  })

  it("reports a response it cannot read", async () => {
    // messageerror instead of message: the worker answered, but the
    // answer did not survive the trip. No id comes with it, so every
    // request still waiting is one that will never be answered
    const worker = useFakeWorker()
    const runner = createRunner()
    const instance = worker.constructed[0]
    if (instance) {
      instance.postMessage = () => undefined
    }
    const inFlight = runner.run("* Hello", { direction: "org-to-md" })
    instance?.emit("messageerror")
    await expect(inFlight).rejects.toThrow(/could not be read/)
  })

  it("converts in place once the worker has died", async () => {
    // a worker that throws on startup takes its in-flight requests with
    // it; leaving those promises unsettled hangs the output box forever
    const worker = useFakeWorker()
    const runner = createRunner()
    const instance = worker.constructed[0]
    const inFlight = runner.run("* Before", { direction: "org-to-md" })
    instance?.emit("error")

    expect(await inFlight).toEqual({ output: "# Before\n", warnings: [] })
    expect(instance?.terminated).toBe(true)
    expect(await runner.run("* After", { direction: "org-to-md" })).toEqual({
      output: "# After\n",
      warnings: []
    })
  })

  it("reports a rescue conversion that cannot be loaded", async () => {
    // the rescue imports the pipeline chunk on first use, which is a
    // fetch: offline, or after a deploy rotated the hashed name under a
    // tab that stayed open, it never arrives. Both the dead worker and
    // its stand-in have failed by then, and the caller is still waiting
    vi.resetModules()
    vi.doMock("../../../web/src/pipeline/convert.js", () => {
      throw new Error("chunk gone")
    })
    try {
      const { createRunner: create } =
        await import("../../../web/src/pipeline/runner.js")
      const worker = useFakeWorker()
      const runner = create()
      const instance = worker.constructed[0]
      if (instance) {
        instance.postMessage = () => undefined
      }
      const inFlight = runner.run("* Before", { direction: "org-to-md" })
      instance?.emit("error")
      // that it settles at all is the point; the message belongs to
      // vitest's mock loader, not to anything the runner produced
      await expect(inFlight).rejects.toThrow()
    } finally {
      vi.doUnmock("../../../web/src/pipeline/convert.js")
      vi.resetModules()
    }
  })
})
