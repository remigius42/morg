import { normalizeMarkdown, normalizeOrg } from "./normalize.js"
import type { NormalizeOptions } from "./normalize.js"
import type { Format } from "./presets/sides.js"
import { translateMarkdown, translateOrg } from "./translate.js"

/**
 * Converts within one format: two presets translate between their
 * dialects, one normalizes (ADR 0006). What both adapters do with one
 * format on both sides.
 * @param text The document.
 * @param format Its format, on both sides.
 * @param options The conversion's options, presets included.
 * @returns The translated or normalized document.
 */
export function convertWithinFormat(
  text: string,
  format: Format,
  options: NormalizeOptions = {}
): string {
  const markdown = format === "markdown"
  if (options.inputPreset || options.outputPreset) {
    return (markdown ? translateMarkdown : translateOrg)(text, options)
  }
  return (markdown ? normalizeMarkdown : normalizeOrg)(text, options)
}
