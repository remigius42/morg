# Configuration

Options can live in a `morg.toml` (auto-discovered in the working
directory, or passed via `--config path`). Precedence: CLI flags >
config file > defaults. Sections mirror the library options objects;
unknown top-level keys are rejected so typos fail loudly.

Boolean CLI flags take an optional value: `--silent` is shorthand for
`--silent true`, and `--silent false` turns off a config that sets it,
which is what makes the precedence above hold in both directions.

Presets resolve per side: `--input-preset`, then `--preset`, then
`inputPreset`, then `preset`, else Vanilla (likewise for the output).
So a config can name the vault's dialect and a flag override one side:
with `preset = "logseq"`, `--output-preset vanilla` reads Logseq org
and writes Vanilla Markdown. `preset` next to a different side preset
in the same place (both flags, or both keys) is an error. `preset`
leaves a side Vanilla whose format it has no dialect for (Obsidian
writes no org); a side preset without one is an error. With one format
on both sides, one preset normalizes and two translate.

The [Web UI](https://morg.binarypoetry.ch) accepts the same TOML in
its Config panel.

## Full reference

```toml
preset = "logseq"     # dialect preset: "vanilla" | "logseq" | "obsidian"
# or one per side (ADR 0006): the dialect the input is read in and the
# one the output is written in; next to preset only if they agree
# inputPreset = "logseq"
# outputPreset = "vanilla"
silent = false        # suppress dropped-construct warnings (CLI -s)

# custom names for org-ism key:: lines (canonical = custom);
# convergence is per-config: convert with the mapping a file
# was written with (ADR 0002)
[orgismKeys]
todo = "state"
scheduled = "when"

# Options are named by format and side (ADR 0007): an input section is
# about reading that format, an output section about writing it

# a construct's Spelling for both sides of Markdown; see "Spelling"
[markdown]
definitionList = "markdown"  # "markdown" | "html"
underline = "markdown"
superscript = "markdown"
subscript = "markdown"

# reading Markdown: also read a construct's HTML spelling as the
# construct (its own spelling is always read)
[markdown.input.interpretHtml]
definitionList = false

[markdown.output]
definitionList = "markdown"  # the Spelling to write, over [markdown]
taskCheckboxes = false       # lossy: bare TODO/DONE headlines → - [ ] / - [x]

# preserve org-only constructs in Markdown; false or a per-construct
# table
[markdown.output.preserveOrgisms]
drawers = true

# Markdown output style (canonical form is per-config, ADR 0001):
# round trips must use the same style
[markdown.output.style]
bullet = "-"        # "-" | "*" | "+"
emphasis = "*"      # "*" | "_"
strong = "*"        # "*" | "_" (doubled in output)
fence = "`"         # "`" | "~"
rule = "-"          # "-" | "*" | "_"
ruleRepetition = 3  # marker count for thematic breaks (min 3)

[org.output]
# record the source's own markdown style as a #+MORG_MARKDOWN_STYLE:
# keyword, so the return trip restores it instead of canonicalizing
# it; a marker the document uses inconsistently is skipped and warns
# (ADR 0004)
recordMarkdownStyle = false

# preserve markdown-only constructs in org; false or a per-construct
# table (ADR 0002)
[org.output.preserveMdisms]
html = false
```

## Spelling

An org construct Markdown cannot write losslessly in its own syntax,
but HTML can, has two spellings (ADR 0007): `"markdown"`, the
default, writes it in Markdown's syntax, or as verbatim org text org
re-parses where Markdown has none; `"html"` writes `<dl>`, `<u>`,
`<sup>` or `<sub>`.

| Construct        | `"markdown"`               | `"html"` |
| ---------------- | -------------------------- | -------- |
| `definitionList` | `- term :: def` (org text) | `<dl>`   |
| `underline`      | `_x_` (org text)           | `<u>`    |
| `superscript`    | `^{x}` (org text)          | `<sup>`  |
| `subscript`      | `_{x}` (org text)          | `<sub>`  |

A construct in `[markdown]` sets both sides: `"html"` reads its bare
HTML (no attributes) back as the construct and writes it, so the round
trip converges with the HTML in Markdown and the construct in org.
`[markdown.input.interpretHtml]` and `[markdown.output]` override one
side each. Different sides migrate: reading HTML and writing
`"markdown"` turns a document's HTML into the construct once and for
all; writing `"html"` without reading it is a one-way door, the HTML
coming back as a preserved export block. HTML morg cannot read as the
construct, attributes included, is preserved per `preserveMdisms`.

`--html` sets every construct to `"html"` on both sides, and
`--html false` to `"markdown"`, over the config.

## Formatter compatibility snippets

morg's canonical Markdown can be aligned with common Markdown
formatters so that formatting morg output produces no diff.

### prettier

```toml
# prettier compatibility: morg's canonical form already matches
# prettier's defaults except the emphasis marker
[markdown.output.style]
emphasis = "_"
```

Verified by test (`tests/formatterCompat.spec.ts`): morg output under
this config is a prettier fixed point. Known residual differences,
inherent rather than style knobs:

- prettier also formats **code inside fenced blocks** (embedded
  language formatting); morg passes code through verbatim.
- prettier pads GFM table delimiter rows to at least `---`; morg pads
  to the column width, so tables whose widest cell is under three
  characters differ.

### mdformat

```toml
# mdformat compatibility: defaults align except thematic breaks,
# which mdformat writes as 70 underscores
[markdown.output.style]
rule = "_"
ruleRepetition = 70
```

Best-effort (mdformat is a Python tool and not exercised in morg's
test suite): bullet `-`, `*`/`**` emphasis and backtick fences align
with morg's defaults, and both tools alternate bullet markers between
consecutive lists. mdformat's `1.`-only ordered-list numbering and
its escaping choices may still normalize morg output.
