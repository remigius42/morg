import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
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
