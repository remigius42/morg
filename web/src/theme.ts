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

export function initThemeToggle(
  light: HTMLButtonElement | null,
  dark: HTMLButtonElement | null
): void {
  if (!light || !dark) {
    return
  }
  const update = () => {
    const current = effectiveTheme()
    light.disabled = current === "light"
    dark.disabled = current === "dark"
    light.classList.toggle("active", current === "light")
    dark.classList.toggle("active", current === "dark")
  }
  const choose = (theme: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // storage may be unavailable; theme still applies for this page
    }
    document.documentElement.dataset.theme = theme
    update()
  }
  light.addEventListener("click", () => choose("light"))
  dark.addEventListener("click", () => choose("dark"))
  update()
}

/** Follow theme toggles made in other same-origin frames/tabs. */
export function watchThemeChanges(): void {
  window.addEventListener("storage", event => {
    if (event.key === THEME_KEY) {
      applyTheme()
    }
  })
}
