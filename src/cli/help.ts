import { FLAGS, type FlagSpec } from "./flags.js"

const signature = (spec: FlagSpec) =>
  spec.arg ? `${spec.names.join(", ")} ${spec.arg}` : spec.names.join(", ")

// one column width across both sections, so the descriptions line up
const DESCRIPTION_COLUMN =
  Math.max(...FLAGS.map(spec => signature(spec).length)) + 2

const section = (specs: FlagSpec[]) =>
  specs
    .map(
      spec =>
        `  ${signature(spec).padEnd(DESCRIPTION_COLUMN)}${spec.description}`
    )
    .join("\n")

export const HELP_TEXT = `Usage: morg [normalize] [options]

Convert between Markdown and Org-mode. Reads stdin and writes stdout
unless --input/--output are given; formats are inferred from the .md and
.org file extensions, so --from/--to are only needed for stdin or stdout.

Commands:
  ${"normalize".padEnd(DESCRIPTION_COLUMN)}Round-trip a document through the other format
  ${"".padEnd(DESCRIPTION_COLUMN)}and back, canonicalizing it in its own format

Options:
${section(FLAGS.filter(spec => spec.kind !== "style"))}

Markdown style:
${section(FLAGS.filter(spec => spec.kind === "style"))}

Examples:
  morg --input notes.md --output notes.org
  morg --from markdown < notes.md > notes.org
  morg normalize --input notes.org --output notes.org
`
