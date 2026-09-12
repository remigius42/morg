import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"

/**
 * Build-time version string for the Web UI: `git describe --tags`, so a
 * deploy from `main` reads `v0.2.0-3-g<sha>` rather than claiming to
 * be the release it is three commits past. A shallow checkout has no
 * tags and still yields a bare commit SHA via `--always` — hence
 * `fetch-depth: 0` in the CI build; the fallback below only covers git
 * being absent entirely (e.g. a published tarball).
 * @returns The version string to inject as `__MORG_VERSION__`.
 */
export function resolveVersion(): string {
  try {
    return execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim()
  } catch {
    const require = createRequire(import.meta.url)
    const { version } = require("../package.json") as { version: string }
    return `v${version}`
  }
}
