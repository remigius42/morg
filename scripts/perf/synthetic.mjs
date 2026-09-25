// Seeded synthetic documents for the performance gate: the same text on
// every run, made of the constructs morg's transforms and escape passes
// work on. Invented, not taken from anyone's notes.

const WORDS = (
  "alpha beta gamma delta note idea plan draft point table value river " +
  "stone cloud field model layer query cache index token route build " +
  "check order signal branch source target module parser render output"
).split(" ")

// locked: the recorded timings hold for these documents only; changing a
// seed, like any change to this generator, means recording the tags
// again (a test pins the documents' hash to catch it)
const MARKDOWN_SEED = 1
const ORG_SEED = 2
// large enough to average out per-block costs, small enough for CI
const SIZE_KIB = 32

// mulberry32: small, fast and good enough to vary the text
function random(seed) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generator(seed) {
  const next = random(seed)
  const int = n => Math.floor(next() * n)
  const pick = items => items[int(items.length)]
  const word = () => pick(WORDS)
  const words = n => Array.from({ length: n }, word).join(" ")
  return { int, pick, word, words }
}

// a sentence with inline constructs, in md or org syntax
function sentence(g, md, footnote) {
  const inline = md
    ? [
        () => `**${g.words(2)}**`,
        () => `*${g.word()}*`,
        () => `\`${g.word()}_${g.word()}\``,
        () => `~~${g.word()}~~`,
        () => `[${g.word()}](https://example.com/${g.word()})`,
        () => `[${g.word()}](${g.word()}.md#${g.word()})`,
        () => `[[${g.word()}|${g.word()}]]`,
        () => `${g.word()}_${g.word()}`,
        () => `x^${g.int(9)}`,
        () => `/${g.word()}/${g.word()}/`,
        () => `[^${footnote()}]`
      ]
    : [
        () => `*${g.words(2)}*`,
        () => `/${g.word()}/`,
        () => `~${g.word()}~`,
        () => `=${g.word()}=`,
        () => `+${g.word()}+`,
        () => `[[https://example.com/${g.word()}][${g.word()}]]`,
        () => `[[file:${g.word()}.org::${g.word()}][${g.word()}]]`,
        () => `H_{${g.int(9)}}O`,
        () => `x^{${g.int(9)}}`,
        () => `[fn:${footnote()}]`
      ]
  const parts = Array.from({ length: 4 + g.int(6) }, () =>
    g.int(3) ? g.word() : g.pick(inline)()
  )
  return `${parts.join(" ")}.`
}

function paragraph(g, md, footnote, lines = 1 + g.int(3)) {
  return Array.from({ length: lines }, () => sentence(g, md, footnote)).join(
    "\n"
  )
}

function mdBlock(g, footnote) {
  const text = () => paragraph(g, true, footnote)
  switch (g.int(8)) {
    case 0:
      return `${"#".repeat(1 + g.int(3))} ${g.words(3)}`
    case 1:
      return [
        `- ${g.words(3)}`,
        `  - ${sentence(g, true, footnote)}`,
        `  - ${g.words(2)}`,
        "",
        `  ${sentence(g, true, footnote)}`,
        `- ${g.words(2)}`,
        "",
        "  ```js",
        `  if (${g.word()}) {`,
        `    ${g.word()}()`,
        "  }",
        "  ```"
      ].join("\n")
    case 2:
      return [
        `1. ${sentence(g, true, footnote)}`,
        `2. ${g.words(3)}`,
        `3. ${g.words(2)}`
      ].join("\n")
    case 3:
      return [
        "```py",
        `def ${g.word()}():`,
        `    return ${g.int(99)}`,
        "```"
      ].join("\n")
    case 4:
      return [
        `| ${g.word()} | ${g.word()} |`,
        "| --- | --- |",
        `| ${g.word()} \\| ${g.word()} | **${g.word()}** |`,
        `| \`${g.word()}\` | ${g.word()}_${g.word()} |`
      ].join("\n")
    case 5:
      return `> ${sentence(g, true, footnote)}\n> ${g.words(4)}`
    default:
      return text()
  }
}

function orgBlock(g, footnote) {
  const text = () => paragraph(g, false, footnote)
  switch (g.int(9)) {
    case 0:
      return [
        `${"*".repeat(1 + g.int(3))} ${g.words(3)}`,
        `SCHEDULED: <2026-0${1 + g.int(9)}-1${g.int(9)} Mon>`,
        ":PROPERTIES:",
        `:${g.word()}: ${g.word()}`,
        ":END:"
      ].join("\n")
    case 1:
      return [
        `- ${g.words(3)}`,
        `  - ${sentence(g, false, footnote)}`,
        `  - ${g.words(2)}`,
        `  ${sentence(g, false, footnote)}`,
        `- ${g.words(2)}`,
        "  #+begin_src js",
        `  if (${g.word()}) {`,
        `    ${g.word()}()`,
        "  }",
        "  #+end_src"
      ].join("\n")
    case 2:
      return [
        "#+begin_src py",
        `def ${g.word()}():`,
        `    return ${g.int(99)}`,
        "#+end_src"
      ].join("\n")
    case 3:
      return [
        `| ${g.word()} | ${g.word()} |`,
        "|-",
        `| ~${g.word()}~ | *${g.word()}* |`
      ].join("\n")
    case 4:
      return `#+begin_quote\n${sentence(g, false, footnote)}\n#+end_quote`
    case 5:
      return `:LOGBOOK:\n- Note taken on [2026-01-0${1 + g.int(9)} Thu]\n:END:`
    default:
      return text()
  }
}

function document(kib, md) {
  const g = generator(md ? MARKDOWN_SEED : ORG_SEED)
  let footnotes = 0
  const footnote = () => {
    footnotes++
    return footnotes
  }
  const blocks = []
  let size = 0
  while (size < kib * 1024) {
    const block = md ? mdBlock(g, footnote) : orgBlock(g, footnote)
    blocks.push(block)
    size += block.length + 2
  }
  const definitions = Array.from({ length: footnotes }, (_, i) =>
    md ? `[^${i + 1}]: ${g.words(4)}` : `[fn:${i + 1}] ${g.words(4)}`
  )
  return `${blocks.join("\n\n")}\n\n${definitions.join("\n\n")}\n`
}

/**
 * A synthetic Markdown document of about `kib` KiB.
 * @param {number} [kib] The size in KiB, the gate's by default.
 * @returns {string} The document.
 */
export function syntheticMarkdown(kib = SIZE_KIB) {
  return document(kib, true)
}

/**
 * A synthetic org document of about `kib` KiB.
 * @param {number} [kib] The size in KiB, the gate's by default.
 * @returns {string} The document.
 */
export function syntheticOrg(kib = SIZE_KIB) {
  return document(kib, false)
}
