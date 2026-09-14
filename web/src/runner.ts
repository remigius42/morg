import {
  runConversion,
  type ConversionForm,
  type ConversionResult
} from "./convert.js"

/**
 * Where a conversion runs. Asynchronous even when the implementation is
 * not, so the caller is written once and the thread it runs on can change
 * underneath it.
 */
export interface ConversionRunner {
  run(
    input: string,
    form: ConversionForm,
    config?: string
  ): Promise<ConversionResult>
}

/** Converts on the calling thread. Blocks it for the duration. */
export const synchronousRunner: ConversionRunner = {
  run: (input, form, config) =>
    Promise.resolve(runConversion(input, form, config))
}
