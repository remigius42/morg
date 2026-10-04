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

export const HELP_TEXT = `Usage: morg [options]

Convert between Markdown and Org-mode. Reads stdin and writes stdout
unless --input/--output are given; formats are inferred from the .md and
.org file extensions, so --from/--to are only needed for stdin or stdout.
One format on both sides translates between two presets' dialects, and
with one preset normalizes: a round trip through the other format.

Options:
${section(FLAGS.filter(spec => spec.kind !== "style"))}

Markdown style:
${section(FLAGS.filter(spec => spec.kind === "style"))}

Examples:
  morg --input notes.md --output notes.org
  morg --from markdown < notes.md > notes.org
  morg --input-preset logseq --input page.md --output page.vanilla.md
  morg --input notes.org --output notes.org
`
