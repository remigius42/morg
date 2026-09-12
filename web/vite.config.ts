import { resolve } from "node:path"
import { defineConfig } from "vite"
import { resolveVersion } from "./version.js"

export default defineConfig({
  define: {
    __MORG_VERSION__: JSON.stringify(resolveVersion())
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
