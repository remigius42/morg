import type { ConversionForm, ConversionResult } from "./convert.js"
import type { WorkerRequest, WorkerResponse } from "./workerProtocol.js"

/**
 * Where a conversion runs. Asynchronous even when the implementation is
 * not, so the caller is written once and the thread it runs on can change
 * underneath it.
 *
 * A conversion that failed on its input comes back as a result carrying
 * an `error`; the promise rejects only where no conversion could be run
 * at all. It always settles one way or the other — a caller left waiting
 * has no way to tell that it is waiting for nothing.
 */
export interface ConversionRunner {
  run(
    input: string,
    form: ConversionForm,
    config?: string
  ): Promise<ConversionResult>
}

/**
 * Converts on the calling thread, blocking it for the duration. The
 * pipeline is imported on first use rather than statically: it is the
 * bulk of the bundle, it normally only ever runs inside the worker, and
 * a page that loads both copies has paid for the freeze it just avoided.
 */
export const synchronousRunner: ConversionRunner = {
  run: async (input, form, config) => {
    const { runConversion } = await import("./convert.js")
    return runConversion(input, form, config)
  }
}

/**
 * Converts off the main thread, so a large document no longer freezes the
 * page. Falls back to converting in place where a worker is unavailable —
 * a blocked or unsupported worker must leave a working converter, and the
 * test environment (happy-dom) has no `Worker` at all.
 */
export function createRunner(): ConversionRunner {
  if (typeof Worker === "undefined") {
    return synchronousRunner
  }
  try {
    // ./worker.ts, not ./worker.js: the URL is resolved against the files
    // on disk by the bundler, not by the TypeScript import rewriting
    return workerRunner(
      new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    )
  } catch {
    return synchronousRunner
  }
}

interface Pending {
  request: WorkerRequest
  resolve: (result: ConversionResult) => void
  reject: (cause: unknown) => void
}

function workerRunner(worker: Worker): ConversionRunner {
  const pending = new Map<number, Pending>()
  let nextId = 0
  // a runner has nobody to report a broken worker to — the page is already
  // wired to it — so it converts in place from here on instead
  let broken = false

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const { id, ...result } = event.data
    pending.get(id)?.resolve(result)
    pending.delete(id)
  })
  // a response that did not survive the trip carries no id, so there is
  // no telling which request it belonged to; none of them will be
  // answered now, and a silent one hangs the caller that is waiting
  worker.addEventListener("messageerror", () => {
    for (const { reject } of pending.values()) {
      reject(
        new Error("The conversion worker sent a reply that could not be read.")
      )
    }
    pending.clear()
  })
  worker.addEventListener("error", () => {
    broken = true
    worker.terminate()
    // whatever was in flight will never come back; convert it here rather
    // than leave the caller waiting on a promise that cannot settle
    for (const { request, resolve, reject } of pending.values()) {
      // the stand-in fetches the pipeline chunk on first use, so it can
      // fail in its own right; passing the failure on is the whole point
      void synchronousRunner
        .run(request.input, request.form, request.config)
        .then(resolve, reject)
    }
    pending.clear()
  })

  return {
    run: (input, form, config) => {
      if (broken) {
        return synchronousRunner.run(input, form, config)
      }
      const request: WorkerRequest = { id: nextId++, input, form, config }
      const settled = new Promise<ConversionResult>((resolve, reject) => {
        pending.set(request.id, { request, resolve, reject })
      })
      try {
        worker.postMessage(request)
      } catch (cause) {
        // structured clone refused the request, so nothing will ever
        // answer it; a leftover entry would outlive the promise it settles
        pending.get(request.id)?.reject(cause)
        pending.delete(request.id)
      }
      return settled
    }
  }
}
