import { configDefaults, defineConfig } from "vitest/config"
import { resolveVersion } from "./web/version.js"

export default defineConfig({
  // same injection the web build does, so the version display is testable
  define: {
    __MORG_VERSION__: JSON.stringify(resolveVersion())
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    // the Playwright specs live under tests/ too, and match the pattern
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    coverage: {
      // reporting only, no thresholds yet; lcov feeds the Codacy upload
      include: ["src/**", "web/src/**"],
      reporter: ["text", "lcov"]
    }
  }
})
