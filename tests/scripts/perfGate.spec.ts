import { describe, it, expect } from "vitest"
// @ts-expect-error -- plain ESM helper, no declarations emitted for scripts/
import { checkPerf, perfFormula, perfTable } from "../../scripts/perf/gate.mjs"

interface Metrics {
  normalizedTime: number
  uniorgParses: number
}
type Results = Record<string, Metrics>
interface Timings {
  tags: Record<string, Results>
  head?: { reason: string } & Record<string, Partial<Metrics> | string>
}

const check = checkPerf as (measured: Results, timings: Timings) => string[]
const formula = perfFormula as (timings: Timings) => string
const table = perfTable as (
  measured: Results,
  timings: Timings
) => Record<string, Record<string, number | undefined>>

const timings: Timings = {
  tags: { "v0.5.0": { "md-org": { normalizedTime: 2, uniorgParses: 10 } } }
}

describe("checkPerf", () => {
  it("passes within 1.25 times the last tag's normalized time and its parses", () => {
    expect(
      check({ "md-org": { normalizedTime: 2.5, uniorgParses: 10 } }, timings)
    ).toEqual([])
  })

  it("fails above 1.25 times the last tag's normalized time", () => {
    expect(
      check({ "md-org": { normalizedTime: 2.6, uniorgParses: 10 } }, timings)
    ).toEqual(["md-org: normalizedTime 2.60 exceeds 1.25 × 2.00 (v0.5.0)"])
  })

  it("fails on more uniorg parses than the last tag", () => {
    expect(
      check({ "md-org": { normalizedTime: 2, uniorgParses: 11 } }, timings)
    ).toEqual(["md-org: 11 uniorg parses exceed 10 (v0.5.0)"])
  })

  it("takes a HEAD entry's numbers over the last tag's", () => {
    const allowed: Timings = {
      ...timings,
      head: { reason: "one more escape pass", "md-org": { uniorgParses: 12 } }
    }
    expect(
      check({ "md-org": { normalizedTime: 2.6, uniorgParses: 12 } }, allowed)
    ).toEqual(["md-org: normalizedTime 2.60 exceeds 1.25 × 2.00 (v0.5.0)"])
    expect(
      check({ "md-org": { normalizedTime: 2, uniorgParses: 13 } }, allowed)
    ).toEqual([
      "md-org: 13 uniorg parses exceed 12 (HEAD: one more escape pass)"
    ])
  })

  it("compares against the latest tag by version, not by name", () => {
    const tags: Timings = {
      tags: {
        "v0.10.0": { "md-org": { normalizedTime: 2, uniorgParses: 10 } },
        "v0.9.0": { "md-org": { normalizedTime: 9, uniorgParses: 90 } }
      }
    }
    expect(
      check({ "md-org": { normalizedTime: 3, uniorgParses: 10 } }, tags)
    ).toEqual(["md-org: normalizedTime 3.00 exceeds 1.25 × 2.00 (v0.10.0)"])
  })
})

describe("perfTable", () => {
  it("shows each metric next to its limit", () => {
    const allowed: Timings = {
      tags: {
        "v0.5.0": {
          "md-org": { normalizedTime: 2, uniorgParses: 10 },
          "org-md": { normalizedTime: 1, uniorgParses: 1 }
        }
      },
      head: { reason: "one more escape pass", "md-org": { uniorgParses: 12 } }
    }
    expect(
      table(
        {
          "md-org": { normalizedTime: 2.1, uniorgParses: 12 },
          "org-md": { normalizedTime: 0.9, uniorgParses: 1 },
          new: { normalizedTime: 1, uniorgParses: 3 }
        },
        allowed
      )
    ).toEqual({
      "md-org": {
        normalizedTime: 2.1,
        "max normalizedTime": 2.5,
        uniorgParses: 12,
        "max uniorgParses": 12
      },
      "org-md": {
        normalizedTime: 0.9,
        "max normalizedTime": 1.25,
        uniorgParses: 1,
        "max uniorgParses": 1
      },
      new: {
        normalizedTime: 1,
        "max normalizedTime": undefined,
        uniorgParses: 3,
        "max uniorgParses": undefined
      }
    })
  })
})

describe("perfFormula", () => {
  it("states the limits and where their references come from", () => {
    expect(formula(timings)).toBe(
      "max normalizedTime = 1.25 × reference, max uniorgParses = reference; reference: v0.5.0"
    )
    expect(
      formula({ ...timings, head: { reason: "one more escape pass" } })
    ).toBe(
      "max normalizedTime = 1.25 × reference, max uniorgParses = reference; reference: HEAD budget where set (one more escape pass), else v0.5.0"
    )
  })
})
