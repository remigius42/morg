import { describe, it, expect } from "vitest"
// @ts-expect-error -- plain ESM helper, no declarations emitted for scripts/
import { disallowedLicenses } from "../../scripts/licenseCheck.mjs"

const disallowed = disallowedLicenses as (
  report: Record<string, { licenses?: string | string[] }>,
  allowed: string[]
) => string[]

describe("disallowedLicenses", () => {
  it("rejects a license that only contains an allowed name", () => {
    // license-checker's own --onlyAllow matches by substring, and passes it
    const report = { "copyleft@1.0.0": { licenses: "AGPL-3.0-or-later" } }

    expect(disallowed(report, ["GPL-3.0-or-later"])).toEqual([
      "copyleft@1.0.0: AGPL-3.0-or-later"
    ])
  })

  it("allows an expression only when every license in it is allowed", () => {
    // an OR choice counts as all of its terms: stricter than SPDX, so a
    // package offering one compatible option fails and needs a decision
    const report = {
      "dual@1.0.0": { licenses: "(MIT OR Apache-2.0)" },
      "mixed@1.0.0": { licenses: "(MIT AND CC-BY-NC-4.0)" }
    }

    expect(disallowed(report, ["MIT", "Apache-2.0"])).toEqual([
      "mixed@1.0.0: (MIT AND CC-BY-NC-4.0)"
    ])
  })

  it("rejects a package that declares no license", () => {
    const report = { "silent@1.0.0": {} }

    expect(disallowed(report, ["MIT"])).toEqual(["silent@1.0.0: undefined"])
  })
})
