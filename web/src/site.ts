// Shared chrome entry for the non-embedded pages.
import "@picocss/pico/css/pico.min.css"
import "./theme.css"
import { applyTheme, initThemeToggle } from "./theme.js"

applyTheme()
initThemeToggle(document.getElementById("themeToggle"))
