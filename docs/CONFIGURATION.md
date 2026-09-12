# Configuration

Options can live in a `morg.toml` (auto-discovered in the working
directory, or passed via `--config path`). Precedence: CLI flags >
config file > defaults. Sections mirror the library options objects;
unknown top-level keys are rejected so typos fail loudly.

Boolean CLI flags take an optional value — `--silent` is shorthand for
`--silent true`, and `--silent false` turns off a config that sets it,
which is what makes the precedence above hold in both directions.

The [Web UI](https://morg.binarypoetry.ch) accepts the same TOML in
its Config panel.

## Full reference

```toml
preset = "logseq"     # dialect preset: "logseq" | "obsidian"
silent = false        # suppress dropped-construct warnings (CLI -s)

# custom names for org-ism key:: lines (canonical = custom);
# convergence is per-config — convert with the mapping a file
# was written with (ADR 0002)
[orgismKeys]
todo = "state"
scheduled = "when"

[markdownToOrg]
# interpret morg's own useHtml vocabulary (bare <u>, <sup>, <sub>,
# <dl>/<dt>/<dd>) as native org constructs; see "HTML flag pairing"
interpretHtml = false

# preserve markdown-only constructs during md → org; false or a
# per-construct table (ADR 0002)
[markdownToOrg.preserveMdisms]
html = false

[orgToMarkdown]
useHtml = false        # render org-only markup as raw HTML
taskCheckboxes = false # lossy: bare TODO/DONE headlines → - [ ] / - [x]

# preserve org-only constructs during org → md; false or a
# per-construct table
[orgToMarkdown.preserveOrgisms]
drawers = true

# Markdown output style (canonical form is per-config, ADR 0001):
# round trips must use the same style
[orgToMarkdown.markdownStyle]
bullet = "-"        # "-" | "*" | "+"
emphasis = "*"      # "*" | "_"
strong = "*"        # "*" | "_" (doubled in output)
fence = "`"         # "`" | "~"
rule = "-"          # "-" | "*" | "_"
ruleRepetition = 3  # marker count for thematic breaks (min 3)
```

## HTML flag pairing

`orgToMarkdown.useHtml` and `markdownToOrg.interpretHtml` are inverses
over the HTML vocabulary morg emits (`<u>`, `<sup>`, `<sub>`,
`<dl>/<dt>/<dd>`, bare tags without attributes); any other HTML is
governed by `preserveMdisms` as usual. The four combinations:

- **both off** (default): org-only markup stays verbatim org text in
  Markdown; HTML passes through preserved in both directions.
- **both on**: lossless symmetric round trip — Markdown holds rendered
  HTML, Org holds native markup.
- **`useHtml` only**: one-way door — org markup becomes HTML, and the
  return trip preserves it as an export block, never restoring the
  native construct.
- **`interpretHtml` only**: HTML-cleanup mode — matching HTML in
  Markdown migrates to native org constructs, and the round trip
  converges away from HTML.

## Formatter compatibility snippets

morg's canonical Markdown can be aligned with common Markdown
formatters so that formatting morg output produces no diff.

### prettier

```toml
# prettier compatibility: morg's canonical form already matches
# prettier's defaults except the emphasis marker
[orgToMarkdown.markdownStyle]
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
[orgToMarkdown.markdownStyle]
rule = "_"
ruleRepetition = 70
```

Best-effort (mdformat is a Python tool and not exercised in morg's
test suite): bullet `-`, `*`/`**` emphasis and backtick fences align
with morg's defaults, and both tools alternate bullet markers between
consecutive lists. mdformat's `1.`-only ordered-list numbering and
its escaping choices may still normalize morg output.
