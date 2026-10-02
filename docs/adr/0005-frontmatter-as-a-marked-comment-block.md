# 0005: Frontmatter as a marked comment block

## Status

Accepted (2026-10-01). Supersedes the frontmatter part of ADR 0002.

## Context

Up to 0.6.0, `md → org` turned each YAML frontmatter key into a
document keyword by upper-casing it (`meh: foo` → `#+MEH: foo`, a
sequence → repeated keywords, structured or multi-line values → JSON on
one line), and `org → md` read every leading `#+KEY:` back.

Frontmatter is passive data; org keywords can be instructions to Emacs.
Upper-cased keys collide with keywords that act: `tags` → `#+TAGS`
declares the tag vocabulary instead of tagging the file, `todo` →
`#+TODO` redefines the TODO keywords, `startup`, `options` and
`include` (which pulls a file into exports) do likewise. The two
constructs look alike and differ widely in reach and consequence.

The mapping also contradicted ADR 0002: frontmatter is an md-ism org
cannot express natively, so §1 requires it to be namespaced, or
"restore vs user data" is undecidable on the return trip.

The return trip has its own problem. A real org file's leading keywords
(`#+TITLE`, `#+STARTUP: overview`, `#+FILETAGS: :a:b:`) became
frontmatter; under any inert mapping they would come back inert, and
`#+STARTUP` would lose its effect. ADR 0001's convergence would then
hold in bytes but break in substance.

## Decision

1. **`md → org` writes the whole frontmatter, verbatim, into a comment
   block marked as morg's**, leading the document:

   ```org
   #+begin_comment morg_frontmatter
   meh: foo
   tags: [a, b]
   #+end_comment
   ```

   The block is inert in Emacs and in export, its ownership is
   unambiguous (ADR 0002 §1), and it is lossless for any YAML,
   comments and multi-line values included, without an encoding. No
   key is mapped to a native org keyword, `title` included: mapping
   keys by meaning would be guessing.

2. **Lines org would read as structure are comma-escaped**, as Org
   does in every block: a line starting (after indentation) with `*`
   or `#+`, or with commas followed by either, gets one more leading
   comma, and `org → md` removes exactly one.
3. **Leading org keywords travel as a `morg_keywords` frontmatter
   entry**, an ordered sequence of one-entry maps
   (`- STARTUP: overview`), and come back as the same keywords. Order and
   repeats survive; keys come back upper-cased, as uniorg reads them
   (Org ignores keyword case); the value is the keyword's text,
   unparsed.
   `#+MORG_MARKDOWN_STYLE:` (ADR 0004) is consumed before and is not
   part of it.
   A file-level property drawer (org-roam's `:ID:`) travels the same
   way, as `morg_properties`, and comes back as the drawer leading the
   file, where org reads it as the file's.
4. **Presets may map page properties natively** (ADR 0002 §4). The
   Logseq preset does: Logseq reads leading `#+key: value` lines of an
   org page, and a leading `key:: value` block of a Markdown page, as
   page properties. It maps the two onto each other, and flat
   frontmatter entries to keywords too (a sequence as `a, b`, as
   Logseq writes it); what a keyword line cannot hold stays in the
   block, and so do keys that act in Emacs or in export (`todo`,
   `include`, `setupfile`, `call`, …), since frontmatter is passive
   data. `tags` maps: in Logseq it tags the page.

## Consequences

- Files written by 0.6.0 and earlier carry the old keywords. They now
  read as org-native keywords and travel as `morg_keywords`, which
  converges but no longer yields `title:` for Markdown tools. A
  migration note covers it: re-convert from the Markdown source, or
  move the keywords into the block by hand.
- Markdown tools (Obsidian, static site generators) do not see an org
  file's `#+TITLE` as `title`. Accepted: a readable copy would be a
  second copy that desynchronizes on the first edit.
- uniorg keeps neither the block's parameter nor its unescaped value, so
  morg writes the block as raw text and recognizes it by its source
  line.
- **Rejected: plain keywords** (`#+KEY:`). Reach and collisions, see
  Context.
- **Rejected: plain `# key: value` comments.** Indistinguishable from a
  user's real comments on the way back.
- **Rejected: `#+MORG_KEY:` keywords.** Namespaced, but noise, and
  still in need of the JSON-on-one-line encoding.
- **Rejected: an allowlist (`title` → `#+TITLE`).** Guessing at
  meaning; and on the way back a `#+TITLE` would be undecidable
  between the allowlist and a native keyword.
