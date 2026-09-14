/**
 * What the Web UI's direction select means, and the questions the page
 * asks of it. Its own module, with no imports: the page reads a direction
 * on every keystroke, but the conversion pipeline these describe lives in
 * the worker, and anything reachable from here lands in the main bundle.
 */
export type Direction =
  "md-to-org" | "org-to-md" | "normalize-md" | "normalize-org"

/** Whether a direction reads Markdown (rather than Org) as its input. */
export function readsMarkdown(direction: Direction): boolean {
  return direction === "md-to-org" || direction === "normalize-md"
}

/** Whether a direction rewrites its input format rather than converting. */
export function normalizes(direction: Direction): boolean {
  return direction === "normalize-md" || direction === "normalize-org"
}

/** Whether a direction writes Markdown (rather than Org) as its output. */
export function writesMarkdown(direction: Direction): boolean {
  return direction === "org-to-md" || direction === "normalize-md"
}
