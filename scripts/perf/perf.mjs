// The performance gate, run on the synthetic documents:
//
//   node scripts/perf/perf.mjs                 gate dist/ (build first)
//   node scripts/perf/perf.mjs --record TAG…   build and record tags
//
// Times are normalized: each is divided by the time plain remark and
// uniorg take to parse the same documents in the same run, so numbers
// recorded on one machine hold on another. Tags are built in temporary
// git worktrees sharing this checkout's node_modules, so every version runs
// on the same dependencies and only morg's own code differs.

import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import console from "node:console"
import { performance } from "node:perf_hooks"
import process from "node:process"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import remarkParse from "remark-parse"
import { unified } from "unified"
import uniorgParse from "uniorg-parse"
import { checkPerf, perfFormula, perfTable } from "./gate.mjs"
import {
  syntheticMarkdown,
  syntheticOrg,
  syntheticScriptlessMarkdown
} from "./synthetic.mjs"

const ROOT = resolve(import.meta.dirname, "../..")
const TIMINGS = join(import.meta.dirname, "timings.json")
const RUNS = 9

const markdown = syntheticMarkdown()
const org = syntheticOrg()
const scriptless = syntheticScriptlessMarkdown()

// counts uniorg parses, whoever's unified processor runs them
let uniorgParses = 0
const processor = Object.getPrototypeOf(unified())
const parse = processor.parse
processor.parse = function (...args) {
  if (this.attachers.some(([plugin]) => plugin === uniorgParse)) {
    uniorgParses++
  }
  return parse.apply(this, args)
}

const markdownParser = unified().use(remarkParse).freeze()
const orgParser = unified().use(uniorgParse).freeze()

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function elapsed(run) {
  const start = performance.now()
  run()
  return performance.now() - start
}

// the conversion's time in units of the reference's, interleaved so
// both see the same machine state; the median of RUNS after a warm-up
function normalizedTime(run) {
  const reference = () => {
    markdownParser.parse(markdown)
    orgParser.parse(org)
  }
  run()
  reference()
  const ratios = Array.from(
    { length: RUNS },
    () => elapsed(run) / elapsed(reference)
  )
  return Math.round(median(ratios) * 100) / 100
}

async function measure(dist) {
  const morg = await import(pathToFileURL(join(dist, "index.js")).href)
  const obsidian = { preset: morg.obsidian() }
  const conversions = {
    "md-org": () => morg.convertMarkdownToOrg(markdown),
    "md-org obsidian": () => morg.convertMarkdownToOrg(markdown, obsidian),
    "md-org scriptless": () => morg.convertMarkdownToOrg(scriptless),
    "md-org scriptless obsidian": () =>
      morg.convertMarkdownToOrg(scriptless, obsidian),
    "org-md": () => morg.convertOrgToMarkdown(org),
    "org-md obsidian": () => morg.convertOrgToMarkdown(org, obsidian)
  }
  const results = {}
  for (const [name, run] of Object.entries(conversions)) {
    uniorgParses = 0
    run()
    const parses = uniorgParses
    results[name] = {
      normalizedTime: normalizedTime(run),
      uniorgParses: parses
    }
  }
  return results
}

// in a child process of its own, so versions do not share a warmed-up
// or polluted JIT
function measureInChild(dist) {
  const output = execFileSync(
    process.execPath,
    [import.meta.filename, "--measure", dist],
    { encoding: "utf8" }
  )
  return JSON.parse(output)
}

function buildTag(tag) {
  const dir = mkdtempSync(join(tmpdir(), `morg-${tag}-`))
  execFileSync("git", ["worktree", "add", "--detach", dir, tag], {
    cwd: ROOT,
    stdio: "ignore"
  })
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"))
  execFileSync("npx", ["tsc", "-p", "tsconfig.build.json"], { cwd: dir })
  return dir
}

function removeTag(dir) {
  execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: ROOT })
  rmSync(dir, { recursive: true, force: true })
}

function readTimings() {
  return JSON.parse(readFileSync(TIMINGS, "utf8"))
}

function record(tags) {
  const timings = readTimings()
  for (const tag of tags) {
    const dir = buildTag(tag)
    try {
      timings.tags[tag] = measureInChild(join(dir, "dist"))
      console.log(tag, timings.tags[tag])
    } finally {
      removeTag(dir)
    }
  }
  writeFileSync(TIMINGS, `${JSON.stringify(timings, null, 2)}\n`)
}

function gate() {
  const measured = measureInChild(join(ROOT, "dist"))
  const timings = readTimings()
  console.log(perfFormula(timings))
  console.table(perfTable(measured, timings))
  const failures = checkPerf(measured, timings)
  for (const failure of failures) {
    console.error(`perf: ${failure}`)
  }
  process.exitCode = failures.length ? 1 : 0
}

const [mode, ...args] = process.argv.slice(2)
if (mode === "--measure") {
  process.stdout.write(JSON.stringify(await measure(args[0])))
} else if (mode === "--record") {
  record(args)
} else {
  gate()
}
