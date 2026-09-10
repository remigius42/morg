// Shared chrome entry for the non-embedded pages; the stylesheet is
// linked in the HTML head so styles apply before first paint.
import { applyTheme, initThemeToggle } from "./theme.js"

applyTheme()
initThemeToggle(
  document.getElementById("themeLight") as HTMLButtonElement | null,
  document.getElementById("themeDark") as HTMLButtonElement | null
)
