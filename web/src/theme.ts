const THEME_KEY = "morg-theme"

export type Theme = "light" | "dark"

/** Explicit theme, if any: `?theme=` param > stored choice > none (OS). */
export function resolveTheme(
  param: string | null,
  stored: string | null
): Theme | undefined {
  if (param === "light" || param === "dark") {
    return param
  }
  if (stored === "light" || stored === "dark") {
    return stored
  }
  return undefined
}

function readStored(): string | null {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

export function applyTheme(): void {
  const theme = resolveTheme(
    new URLSearchParams(location.search).get("theme"),
    readStored()
  )
  if (theme) {
    document.documentElement.dataset.theme = theme
  } else {
    delete document.documentElement.dataset.theme
  }
}

function effectiveTheme(): Theme {
  const set = document.documentElement.dataset.theme
  if (set === "light" || set === "dark") {
    return set
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function initThemeToggle(button: HTMLElement | null): void {
  if (!button) {
    return
  }
  const updateLabel = () => {
    button.textContent = effectiveTheme() === "dark" ? "☀️" : "🌙"
  }
  button.addEventListener("click", () => {
    const next: Theme = effectiveTheme() === "dark" ? "light" : "dark"
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // storage may be unavailable; theme still applies for this page
    }
    document.documentElement.dataset.theme = next
    updateLabel()
  })
  updateLabel()
}

/** Follow theme toggles made in other same-origin frames/tabs. */
export function watchThemeChanges(): void {
  window.addEventListener("storage", event => {
    if (event.key === THEME_KEY) {
      applyTheme()
    }
  })
}
