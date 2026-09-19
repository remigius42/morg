import { describe, it, expect } from "vitest"
// @ts-expect-error -- plain ESM helper, no declarations emitted for scripts/
import { openReleaseSection } from "../../scripts/openReleaseSection.mjs"

const open = openReleaseSection as (
  changelog: string,
  version: string,
  date: string
) => string

const changelog = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "",
  "- A thing.",
  "",
  "## [0.3.0] - 2026-09-16",
  "",
  "### Added",
  "",
  "- An older thing.",
  "",
  "[unreleased]: https://github.com/remigius42/morg/compare/v0.3.0...HEAD",
  "[0.3.0]: https://github.com/remigius42/morg/compare/v0.2.0...v0.3.0",
  ""
].join("\n")

describe("openReleaseSection", () => {
  it("heads the pending entries with the version and date", () => {
    const released = open(changelog, "0.4.0", "2026-09-19")

    expect(released).toContain("## [Unreleased]\n\n## [0.4.0] - 2026-09-19\n")
  })

  it("keeps the entries under the new heading, not under Unreleased", () => {
    const released = open(changelog, "0.4.0", "2026-09-19")
    const pending = released.split("## [Unreleased]\n")[1] ?? ""

    expect(pending.slice(0, pending.indexOf("\n## ["))).not.toContain("- A")
    expect(released.indexOf("- A thing.")).toBeGreaterThan(
      released.indexOf("## [0.4.0]")
    )
  })

  it("compares the new version against the previous one", () => {
    const released = open(changelog, "0.4.0", "2026-09-19")

    expect(released).toContain(
      "[0.4.0]: https://github.com/remigius42/morg/compare/v0.3.0...v0.4.0"
    )
  })

  it("moves the unreleased link on to the new version", () => {
    const released = open(changelog, "0.4.0", "2026-09-19")

    expect(released).toContain(
      "[unreleased]: https://github.com/remigius42/morg/compare/v0.4.0...HEAD"
    )
    expect(released).not.toContain("compare/v0.3.0...HEAD")
  })

  it("leaves the older sections and their links alone", () => {
    const released = open(changelog, "0.4.0", "2026-09-19")

    expect(released).toContain("## [0.3.0] - 2026-09-16")
    expect(released).toContain(
      "[0.3.0]: https://github.com/remigius42/morg/compare/v0.2.0...v0.3.0"
    )
    expect(released).toContain("- An older thing.")
  })

  it("is a fixed point for the sections it has already written", () => {
    const once = open(changelog, "0.4.0", "2026-09-19")
    const twice = open(
      once.replace("## [Unreleased]\n", "## [Unreleased]\n\n- Later.\n"),
      "0.5.0",
      "2026-09-20"
    )

    expect(twice).toContain("## [0.4.0] - 2026-09-19")
    expect(twice).toContain(
      "[0.4.0]: https://github.com/remigius42/morg/compare/v0.3.0...v0.4.0"
    )
    expect(twice).toContain(
      "[0.5.0]: https://github.com/remigius42/morg/compare/v0.4.0...v0.5.0"
    )
  })

  describe("refuses rather than guesses", () => {
    it("when a section for the version already exists", () => {
      expect(() => open(changelog, "0.3.0", "2026-09-19")).toThrow(
        "already has a section for 0.3.0"
      )
    })

    it("when there is no Unreleased heading", () => {
      const without = changelog.replace("## [Unreleased]", "## [Nope]")

      expect(() => open(without, "0.4.0", "2026-09-19")).toThrow(
        'no "## [Unreleased]" heading'
      )
    })

    it("when nothing stands under Unreleased", () => {
      const empty = changelog.replace(
        "## [Unreleased]\n\n### Added\n\n- A thing.\n",
        "## [Unreleased]\n"
      )

      expect(() => open(empty, "0.4.0", "2026-09-19")).toThrow(
        'no entries under "## [Unreleased]"'
      )
    })

    it("when there is no previous version to compare against", () => {
      const first = changelog
        .replace(
          "[0.3.0]: https://github.com/remigius42/morg/compare/v0.2.0...v0.3.0\n",
          ""
        )
        .replace("## [0.3.0] - 2026-09-16", "## Nothing")

      expect(() => open(first, "0.4.0", "2026-09-19")).toThrow(
        "no previous version link definition"
      )
    })
  })
})
