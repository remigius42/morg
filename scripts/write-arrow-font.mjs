// Runs before every Web UI build and dev server start (`prebuild:web`,
// `predev:web`): writes DejaVu Sans's arrows, regular and bold, as
// woff2 files web/src/theme.css uses for those characters only.
// Arial's arrows sit low and small beside its letters; DejaVu's sit on
// the middle of the lowercase ones, at the text's weight.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import process from "node:process"
import subsetFont from "subset-font"

// U+2190–U+2194, the range theme.css's unicode-range names
const ARROWS = "←↑→↓↔"
const { resolve } = createRequire(import.meta.url)

mkdirSync("web/src/fonts", { recursive: true })
for (const [weight, file] of [
  ["regular", resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf")],
  ["bold", resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf")]
]) {
  const woff2 = await subsetFont(readFileSync(file), ARROWS, {
    targetFormat: "woff2"
  })
  const out = `web/src/fonts/arrows-${weight}.woff2`
  writeFileSync(out, woff2)
  process.stdout.write(`${out}: ${woff2.length} bytes\n`)
}
