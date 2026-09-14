import { createRequire } from "node:module"
import { resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"
import { resolveVersion } from "./version.js"

/**
 * Keeps the conversion worker off the DOM. `decode-named-character-
 * reference`, reached through remark's entity decoding, ships a browser
 * build that decodes entities by handing them to `document.createElement`
 * — which a worker does not have, so the bundle throws on the first line
 * it runs and the converter silently falls back to blocking the page.
 * The package already publishes a DOM-free build for exactly this; Vite
 * resolves the worker bundle with the browser condition regardless, so
 * the worker build points at it directly.
 */
function domFreeEntityDecoder(): Plugin {
  const dependency = "decode-named-character-reference"
  const domFree = createRequire(import.meta.url).resolve(dependency)
  return {
    name: "morg:dom-free-entity-decoder",
    enforce: "pre",
    resolveId: source => (source === dependency ? domFree : null)
  }
}

export default defineConfig({
  define: {
    __MORG_VERSION__: JSON.stringify(resolveVersion())
  },
  worker: {
    format: "es",
    plugins: () => [domFreeEntityDecoder()]
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        convert: resolve(import.meta.dirname, "convert.html"),
        embed: resolve(import.meta.dirname, "embed.html")
      }
    }
  }
})
