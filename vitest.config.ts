import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    coverage: {
      // reporting only, no thresholds yet; lcov feeds the Codacy upload
      include: ["src/**", "web/src/**"],
      reporter: ["text", "lcov"]
    }
  }
})
