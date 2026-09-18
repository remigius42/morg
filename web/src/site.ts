// Shared chrome entry for the non-embedded pages; the stylesheet is
// linked in the HTML head so styles apply before first paint.
import { followFrameHeight } from "./embedHeight.js"
import { applyTheme, initThemeToggle } from "./theme.js"
import { renderVersion } from "./version.js"

applyTheme()
renderVersion()
initThemeToggle(
  document.getElementById("themeLight") as HTMLButtonElement | null,
  document.getElementById("themeDark") as HTMLButtonElement | null
)

// only the converter page carries the frame; the landing page shares
// this entry and has none
const frame = document.querySelector<HTMLIFrameElement>(".site-frame")
if (frame) {
  followFrameHeight(frame)
}
