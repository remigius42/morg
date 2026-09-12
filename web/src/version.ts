// `git describe --tags` output, injected at build time (see
// web/vite.config.ts). Shown in the page chrome so a support question
// can be answered without guessing which commit is deployed: the Web UI
// ships from every push to `main`, so it is usually ahead of the tag.
declare const __MORG_VERSION__: string | undefined

export const MORG_VERSION =
  typeof __MORG_VERSION__ === "string" ? __MORG_VERSION__ : "unknown"

/** Fills the `#version` placeholder, if the page has one. */
export function renderVersion(): void {
  const element = document.getElementById("version")
  if (!element) {
    return
  }
  element.textContent = MORG_VERSION
  element.title = `morg version ${MORG_VERSION}`
}
