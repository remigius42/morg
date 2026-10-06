# CLI

Run it without installing, or install it globally:

```bash
npx @remigius42/morg --input notes.md --output notes.org
npm install --global @remigius42/morg
```

```bash
# Every flag, with examples; also shown for a bare `morg`
morg --help

# Formats inferred from file extensions; --from and --to take a format
# name (markdown or org), not a path
morg --input notes.md --output notes.org

# stdin/stdout with explicit format
echo "# Hello" | morg --from markdown

# Apply a dialect preset
morg --input page.md --output page.org --preset logseq

# Or one per side: read Logseq org, write Vanilla Markdown (ADR 0006)
morg --input page.org --output page.md --input-preset logseq

# Dropped constructs are reported on stderr; -s / --silent suppresses.
# Boolean flags take an optional value, so --silent false overrides a
# morg.toml that sets it
morg --input notes.md --output notes.org --silent

# Record the source's own markdown style (bullet, emphasis, fence,
# rule) in the org file, so the return trip restores it instead of
# canonicalizing it; markers used inconsistently warn and are skipped
morg --input notes.md --output notes.org --record-markdown-style

# Write and read HTML for what Markdown cannot spell in its own
# syntax (<u>, <sup>, <sub>, <dl>); per construct in the config
morg --input notes.org --output notes.md --html

# Translate between two dialects of one format, changing only what
# they write differently (a block's content stays as written)
morg --input-preset logseq --input page.md --output page.vanilla.md

# Normalize to canonical form (same format and preset in and out); this
# canonicalizes (the one-time reformat a first conversion would apply
# anyway, ADR 0001); it is not a style formatter like prettier
morg --input notes.org --output notes.org
```

## Configuration file

Options can live in a `morg.toml` (auto-discovered in the working
directory, or passed via `--config path`). Precedence: CLI flags >
config file > defaults, per side for the presets:

```toml
preset = "logseq"

[markdown.output.style]
emphasis = "_" # align with prettier
```

The full reference, covering all sections and compatibility snippets
for prettier and mdformat, is in
[configuration reference](configuration.md).
