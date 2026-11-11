import { describe, expect } from "vitest"
import { fc, test } from "@fast-check/vitest"
import { convertMarkdownToOrg } from "../src/markdownToOrg.js"
import { convertOrgToMarkdown } from "../src/orgToMarkdown.js"
import { logseq } from "../src/presets/logseq.js"
import type {
  MarkdownToOrgOptions,
  OrgToMarkdownOptions
} from "../src/options.js"

// Property Test (CONTEXT.md): Convergence on generated input. Opt-in,
// local: MORG_PROPERTY_RUNS sets the run count (`npm run test:property`).
const runs = Number(process.env.MORG_PROPERTY_RUNS)

// syntax-heavy tokens, so the input reaches markup, links, keywords and
// properties far more often than random characters would
const TOKENS = [
  ..."ab1*_/~=+-`|^\\!:#<>()[]{}.$",
  ...[" ", "  ", "\n", "\n\n", "- ", "* ", "1. ", "> ", "# ", "#+"],
  ...["::", "[[", "]]", "((", "))", "@@"]
]
const input = fc
  .array(fc.constantFrom(...TOKENS), { maxLength: 40 })
  .map(tokens => tokens.join(""))

const CONFIGS: [string, MarkdownToOrgOptions & OrgToMarkdownOptions][] = [
  ["core", {}],
  ["logseq", { preset: logseq() }]
]

describe.runIf(runs > 0)("Convergence on generated input", () => {
  for (const [name, options] of CONFIGS) {
    const mdRoundTrip = (md: string): string =>
      convertOrgToMarkdown(convertMarkdownToOrg(md, options), options)
    const orgRoundTrip = (org: string): string =>
      convertMarkdownToOrg(convertOrgToMarkdown(org, options), options)

    test.prop([input], { numRuns: runs })(`${name}: md round trip`, md => {
      const once = mdRoundTrip(md)
      expect(mdRoundTrip(once)).toBe(once)
    })

    test.prop([input], { numRuns: runs })(`${name}: org round trip`, org => {
      const once = orgRoundTrip(org)
      expect(orgRoundTrip(once)).toBe(once)
    })
  }
})
