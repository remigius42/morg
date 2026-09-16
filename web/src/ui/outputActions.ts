/**
 * Getting a conversion out of the page — to the clipboard, or to disk.
 * Its own module because both are mostly browser workarounds rather than
 * converter code: an iframe that refuses the clipboard, an iOS Safari
 * that refuses to select a readonly textarea, a Firefox that ignores a
 * click on an anchor outside the document. None of that is worth reading
 * past to follow how the page converts.
 */
import type { Direction } from "../direction.js"
import { outputFileName } from "./files.js"

/**
 * Copies the output. The Clipboard API is unavailable in a cross-origin
 * iframe without `allow="clipboard-write"`, so a selection copy stands in.
 */
export async function copyOutput(
  output: HTMLTextAreaElement,
  copyError: HTMLElement
): Promise<void> {
  copyError.hidden = true
  try {
    await navigator.clipboard.writeText(output.value)
    return
  } catch {
    // fall through to the selection copy
  }
  // not the conversion error: there it reads as a failed conversion, and
  // the next keystroke takes the instruction away before it can be read
  copyError.hidden = selectionCopy(output)
}

/**
 * Copies via the output's own selection. iOS Safari refuses to select a
 * readonly textarea, so the attribute comes off for the duration.
 */
function selectionCopy(output: HTMLTextAreaElement): boolean {
  const wasReadOnly = output.readOnly
  // copying takes the focus, and in an iframe without clipboard-write
  // that is every copy; someone mid-sentence would be typing into
  // nothing until they clicked back
  const wasFocused = document.activeElement
  output.readOnly = false
  try {
    output.focus()
    output.setSelectionRange(0, output.value.length)
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    output.readOnly = wasReadOnly
    output.setSelectionRange(0, 0)
    if (wasFocused instanceof HTMLElement) {
      wasFocused.focus()
    }
  }
}

/** Saves the output locally; the blob never leaves the browser. */
export function downloadOutput(
  output: HTMLTextAreaElement,
  openedFileName: string | undefined,
  direction: Direction
): void {
  const blob = new Blob([output.value], {
    type: "text/plain;charset=utf-8"
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = outputFileName(openedFileName, direction)
  // Firefox only acts on a click if the anchor is in the document, and
  // revoking in the same task can invalidate the blob before the download
  // task has read it
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
