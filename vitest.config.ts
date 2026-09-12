import { defineConfig } from "vitest/config"
import { resolveVersion } from "./web/version.js"

export default defineConfig({
  // same injection the web build does, so the version display is testable
  define: {
    __MORG_VERSION__: JSON.stringify(resolveVersion())
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    coverage: {
      // reporting only, no thresholds yet; lcov feeds the Codacy upload
      include: ["src/**", "web/src/**"],
      reporter: ["text", "lcov"]
    }
  }
})
