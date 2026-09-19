import type { ConversionForm, ConversionResult } from "./convert.js"

/**
 * What crosses to the conversion worker and back. Its own module so the
 * worker and the runner that talks to it do not import each other.
 * Everything here is plain data: structured clone carries no classes,
 * and `runConversion` returns an error string rather than throwing one.
 */
export interface WorkerRequest {
  /** Correlates a response with its request; responses can overtake. */
  id: number
  input: string
  form: ConversionForm
  config?: string
}

export interface WorkerResponse extends ConversionResult {
  id: number
}
