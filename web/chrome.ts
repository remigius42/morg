import type { Plugin } from "vite"

/**
 * The markup every page shares, written once: each page marks where it
 * goes with `<!-- chrome:head -->`, `<!-- chrome:header -->` and
 * `<!-- chrome:footer -->`, and this fills them in before Vite reads the
 * page, so the stylesheet and script it links are bundled as if written
 * there. Links are relative to the page, which may sit in a subfolder,
 * and the page's own nav link is marked current.
 */
export function siteChrome(): Plugin {
  return {
    name: "morg:site-chrome",
    transformIndexHtml: {
      order: "pre",
      handler: (html, { path }) => fillChrome(html, path)
    }
  }
}

export function fillChrome(html: string, path: string): string {
  const root = "../".repeat(path.split("/").length - 2) || "./"
  const page = path.replace(/^\//, "").replace(/(^|\/)$/, "$1index.html")
  return html
    .replace("<!-- chrome:head -->", head)
    .replace("<!-- chrome:header -->", header(root, page))
    .replace("<!-- chrome:footer -->", footer(root))
}

const head = `<meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <link rel="stylesheet" href="/src/theme.css" />
    <script>
      // applied before first paint to avoid a theme flash; mirrors
      // resolveTheme() in src/theme.ts
      try {
        const theme =
          new URLSearchParams(location.search).get("theme") ||
          localStorage.getItem("morg-theme")
        if (theme === "dark" || theme === "light") {
          document.documentElement.dataset.theme = theme
        }
      } catch {}
    </script>`

const themeSwitch = `<div class="theme-switch" role="group" aria-label="Color scheme">
              <button
                id="themeLight"
                class="theme-toggle"
                aria-label="Light theme"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </button>
              <button
                id="themeDark"
                class="theme-toggle"
                aria-label="Dark theme"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </button>
            </div>`

function header(root: string, page: string): string {
  // a docs page is in the docs section, so Docs is current on all of them
  const current = (target: string) =>
    page === target ||
    (target === "docs/index.html" && page.startsWith("docs/"))
      ? ` aria-current="page"`
      : ""
  const link = (target: string, label: string) =>
    `<li><a href="${root}${target}"${current(target)}>${label}</a></li>`
  return `<header class="container">
      <nav>
        <ul>
          <li>
            <strong><a href="${root}"${current("index.html")}>morg</a></strong>
          </li>
        </ul>
        <ul>
          ${link("convert.html", "Converter")}
          ${link("docs/index.html", "Docs")}
          <li>
            <a href="https://www.npmjs.com/package/@remigius42/morg">npm</a>
          </li>
          <li><a href="https://github.com/remigius42/morg">GitHub</a></li>
          <li>${themeSwitch}</li>
        </ul>
      </nav>
    </header>`
}

const footer = (root: string) => `<footer class="container">
      <small>
        Copyright 2026
        <a href="https://www.binarypoetry.ch">Andreas Remigius Schmidt</a> ·
        <a href="https://github.com/remigius42/morg/blob/main/LICENSE"
          >GPL-3.0-or-later</a
        >
        · <a href="${root}licenses.html">Third-party licenses</a> ·
        <a href="https://www.buymeacoffee.com/remigius">Buy me a coffee</a> ·
        <span id="version"></span>
      </small>
    </footer>`
