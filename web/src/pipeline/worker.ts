import { runConversion } from "./convert.js"
import type { WorkerRequest, WorkerResponse } from "./workerProtocol.js"

/**
 * Converts one request. Separate from the message plumbing so it can be
 * exercised without a real `Worker`.
 */
export function handle(request: WorkerRequest): WorkerResponse {
  return {
    id: request.id,
    ...runConversion(request.input, request.form, request.config)
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  self.postMessage(handle(event.data))
})
