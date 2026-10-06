# Web UI

Try morg without installing anything at
[morg.binarypoetry.ch](https://morg.binarypoetry.ch). All conversion
happens in your browser, nothing is uploaded (see [ADR
0003](adr/0003-client-side-web-ui-on-github-pages.md)). Each side
names its format and dialect (Input: Org (Logseq), Output: Markdown);
the direction follows from the two, the same on both sides normalizes,
two dialects of one format translate (Markdown (Logseq) → Markdown),
and ⇄ swaps them. Its options are grouped by the side they act on
(reading Markdown, writing Markdown, writing org), showing those of the
sides the conversion has; normalizing Org goes through Markdown, so it
shows the Markdown ones that shape the round trip.

## Embedding

The chrome-less embed page (`/embed.html`, optionally with
`?theme=dark|light`) can be iframed into other sites. It posts its
content height to the host on every change, so the frame can follow it
rather than scrolling inside a page that already scrolls:

```js
addEventListener("message", event => {
  if (event.origin !== "https://morg.binarypoetry.ch") return
  if (event.data?.type === "morg:height") {
    frame.style.height = `${event.data.height}px`
  }
})
```

Give the frame at least 768px of width if you can; below that the
input and output stack, which doubles its height. `allow="clipboard-write"`
lets the Copy button use the clipboard rather than falling back to
selecting the output.

## Files

Besides pasting, a file can be opened with the picker or dropped
anywhere on the page: a `.toml` lands in the config panel, a document
in the input, and the conversion direction follows the extension. Drop
both at once and each goes where it belongs; an overlay names what is
accepted while a drag is in flight, and anything that turns out not to
be text is named in the warning list rather than loaded. The result can
be copied or saved with the Copy and Download buttons; a normalized file
is saved as `notes.normalized.org`, a translated one under its dialect
(`page.vanilla.md`), and switching to a direction that no
longer reads the opened file falls back to a generic name, so neither
lands on top of its own source. Files are read and written by the
browser itself; this is not an upload.

## Responsiveness

Typing is converted once you pause, not once per keystroke, and the
conversion itself runs in a web worker, so the page stays responsive
even while a large document is being converted. Copy and Download are
unavailable for as long as a conversion is running, so they can never
save the previous document's output.
