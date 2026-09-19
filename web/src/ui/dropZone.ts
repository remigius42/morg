/**
 * The page-wide drop target: the overlay that announces it, the guards
 * that keep the browser from navigating away, and the routing of what
 * lands. Its own module because all three are one concern wired on the
 * document rather than on any control, and because what a drop *means*
 * is the caller's business, not this file's.
 */
import type { TextFile } from "./files.js"

/**
 * Wires the whole page as a drop target and hands `onFiles` what lands.
 * The whole page, since the form does not cover the viewport and a drop
 * in the margin looked like a broken feature.
 */
export function wireDropZone(onFiles: (files: TextFile[]) => void): void {
  wireOverlay()

  // the browser navigates to a dropped file unless the default is
  // prevented, which would replace the converter and discard the input;
  // dragover needs it too, or no drop event fires at all. Only file drags
  // qualify; cancelling a text drag would break dropping a selection
  // into the textareas, which is native behavior worth keeping.
  for (const type of ["dragover", "drop"]) {
    document.addEventListener(type, event => {
      if (carriesFiles(event as DragEvent)) {
        event.preventDefault()
      }
    })
  }

  document.addEventListener("drop", event => {
    const files = event.dataTransfer?.files
    if (files?.length) {
      onFiles([...files])
    }
  })
}

/**
 * Announces the drop target while files are over it, and says what the
 * converter accepts. Built here rather than in the markup so every page
 * that wires the converter gets it.
 */
function wireOverlay(): void {
  const overlay = document.createElement("div")
  overlay.id = "dropOverlay"
  overlay.className = "drop-overlay"
  overlay.hidden = true
  overlay.textContent = "Drop a document or a morg.toml"
  // inside the landmark rather than on the body: content outside every
  // landmark is skipped by landmark navigation, and the overlay is fixed
  // so its parent has no say in where it paints
  ;(document.querySelector("main") ?? document.body).append(overlay)

  // dragleave fires on every element boundary the pointer crosses, so a
  // plain show/hide pair flickers; only the outermost leave counts
  let depth = 0
  document.addEventListener("dragenter", event => {
    if (!carriesFiles(event)) {
      return
    }
    depth += 1
    overlay.hidden = false
  })
  document.addEventListener("dragleave", event => {
    if (!carriesFiles(event)) {
      return
    }
    depth = Math.max(0, depth - 1)
    overlay.hidden = depth === 0
  })
  document.addEventListener("drop", () => {
    depth = 0
    overlay.hidden = true
  })
}

/** Whether a drag carries files rather than, say, a text selection. */
function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false
}
