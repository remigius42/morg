import { createHash } from "node:crypto"
import { describe, it, expect } from "vitest"
import { convertMarkdownToOrg } from "../../src/index.js"
import {
  syntheticMarkdown,
  syntheticOrg,
  syntheticScriptlessMarkdown
  // @ts-expect-error -- plain ESM helper, no declarations emitted for scripts/
} from "../../scripts/perf/synthetic.mjs"

const markdown = syntheticMarkdown as (kib?: number) => string
const org = syntheticOrg as (kib?: number) => string
const scriptless = syntheticScriptlessMarkdown as (kib?: number) => string

const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex").slice(0, 16)

describe("synthetic perf documents", () => {
  it("are the same on every run, and about the size asked for", () => {
    for (const generate of [markdown, org, scriptless]) {
      const text = generate(64)
      expect(generate(64)).toBe(text)
      expect(text.length).toBeGreaterThanOrEqual(64 * 1024)
      expect(text.length).toBeLessThan(72 * 1024)
    }
  })

  it("hold what the escape passes and block transforms work on", () => {
    const md = markdown(64)
    for (const construct of [
      /^#{1,3} /m,
      /^ {2}- /m,
      /^ {2}```/m,
      /^\| .* \\\| /m,
      /^> /m,
      /\[\^\d+\]/,
      /\w_\w/,
      /\*\*\w/,
      /`[^`]+`/,
      /\[\[[^\]|]+\|/
    ]) {
      expect(md).toMatch(construct)
    }
    const text = org(64)
    for (const construct of [
      /^\*{1,3} /m,
      /^SCHEDULED: </m,
      /^:PROPERTIES:$/m,
      /^:LOGBOOK:$/m,
      /^ {2}#\+begin_src/m,
      /^\| /m,
      /^#\+begin_quote$/m,
      /\[fn:\d+\]/,
      /=\w+=/,
      /~\w+~/
    ]) {
      expect(text).toMatch(construct)
    }
  })

  it("hold a scriptless md document: `_` and `^`, but no bare script", () => {
    const md = scriptless(64)
    for (const construct of [
      /\]\(https:\/\/[^)]*_/,
      /`[^`]*\^[^`]*`/,
      /\w_\{\w+\}/,
      /\^\{\d\}/,
      /\[\[[^\]]*[_^]/
    ]) {
      expect(md).toMatch(construct)
    }
    expect(convertMarkdownToOrg(md)).not.toMatch(/^#\+OPTIONS:/m)
  })

  it("stay the documents the tags' timings were recorded on", () => {
    // changed on purpose? Record the tags again (scripts/perf/perf.mjs
    // --record), then update these hashes
    expect(hash(markdown())).toBe("e4d37e2e3a0ae20f")
    expect(hash(org())).toBe("0d7f9b0b3d28c67e")
    expect(hash(scriptless())).toBe("629eb84554177daa")
  })
})
