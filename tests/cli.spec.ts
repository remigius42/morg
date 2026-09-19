import { execFile } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"
import { parseArgs } from "../src/cli/args.js"
import { FLAGS } from "../src/cli/flags.js"
import { HELP_TEXT } from "../src/cli/help.js"
import { loadConfig } from "../src/cli/configFile.js"
import { resolvePreset } from "../src/cli/presets.js"
import { inferFormats, validateFormats } from "../src/cli/formats.js"
import { buildConversionOptions, convert } from "../src/cli/conversion.js"
import { CliError } from "../src/cli/error.js"

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

describe("parseArgs", () => {
  it("parses conversion flags", () => {
    const args = parseArgs([
      "--from",
      "markdown",
      "--to",
      "org",
      "--input",
      "in.md",
      "--output",
      "out.org",
      "--preset",
      "logseq",
      "--config",
      "custom.toml",
      "-s",
      "--task-checkboxes",
      "--interpret-html"
    ])
    expect(args).toMatchObject({
      normalize: false,
      fromFormat: "markdown",
      toFormat: "org",
      inputFile: "in.md",
      outputFile: "out.org",
      presetName: "logseq",
      configPath: "custom.toml",
      silent: true,
      taskCheckboxes: true,
      interpretHtml: true
    })
  })

  it("recognizes the help and version flags", () => {
    expect(parseArgs(["--help"]).help).toBe(true)
    expect(parseArgs(["-h"]).help).toBe(true)
    expect(parseArgs(["--version"]).version).toBe(true)
    expect(parseArgs(["--from", "org"]).help).toBe(false)
  })

  it("treats help and version as flags, never as values", () => {
    expect(() => parseArgs(["--bullet", "-h"])).toThrow(
      "--bullet requires a value"
    )
    expect(() => parseArgs(["--from", "--help"])).toThrow(
      "--from requires a value"
    )
  })

  it("recognizes the normalize subcommand", () => {
    expect(parseArgs(["normalize", "--from", "org"]).normalize).toBe(true)
    expect(parseArgs(["--from", "org"]).normalize).toBe(false)
  })

  it("collects markdown style flags", () => {
    const args = parseArgs([
      "--bullet",
      "*",
      "--emphasis",
      "_",
      "--rule-repetition",
      "5"
    ])
    expect(args.markdownStyle).toEqual({
      bullet: "*",
      emphasis: "_",
      ruleRepetition: "5"
    })
  })

  it("reads optional true/false values for boolean flags", () => {
    expect(parseArgs(["--silent"]).silent).toBe(true)
    expect(parseArgs(["--silent", "true"]).silent).toBe(true)
    expect(parseArgs(["--silent", "false"]).silent).toBe(false)
    expect(parseArgs(["--task-checkboxes", "false"]).taskCheckboxes).toBe(false)
    expect(parseArgs(["--interpret-html", "false"]).interpretHtml).toBe(false)
    // unset stays unset, so config can still decide
    expect(parseArgs([]).silent).toBeUndefined()
    // a following flag is not the value
    expect(parseArgs(["-s", "--from", "org"])).toMatchObject({
      silent: true,
      fromFormat: "org"
    })
  })

  it("rejects value-taking flags without a value", () => {
    expect(() => parseArgs(["--bullet"])).toThrow("--bullet requires a value")
    expect(() => parseArgs(["--config"])).toThrow("--config requires a value")
    expect(() => parseArgs(["--rule-repetition"])).toThrow(CliError)
    // a following flag is a missing value, not the value
    expect(() => parseArgs(["--from", "--input", "a.md"])).toThrow(
      "--from requires a value"
    )
    // but a lone dash is a legitimate bullet character
    expect(parseArgs(["--bullet", "-"]).markdownStyle.bullet).toBe("-")
  })

  it("parses --record-style as a boolean flag", () => {
    expect(parseArgs(["--record-style"]).recordStyle).toBe(true)
    expect(parseArgs(["--record-style", "false"]).recordStyle).toBe(false)
    expect(parseArgs([]).recordStyle).toBeUndefined()
  })

  it("rejects unknown arguments", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(CliError)
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown argument: --bogus")
  })
})

describe("HELP_TEXT", () => {
  it("lists every flag with its names, argument and description", () => {
    for (const spec of FLAGS) {
      const names = spec.names.join(", ")
      const signature = spec.arg ? `${names} ${spec.arg}` : names
      expect(HELP_TEXT).toMatch(
        new RegExp(
          `^ {2}${escapeRegExp(signature)} +${escapeRegExp(spec.description)}$`,
          "m"
        )
      )
    }
  })

  it("separates markdown style flags from the general options", () => {
    const style = HELP_TEXT.indexOf("Markdown style:")
    expect(HELP_TEXT.indexOf("--from")).toBeLessThan(style)
    expect(HELP_TEXT.indexOf("--bullet")).toBeGreaterThan(style)
  })
})

describe("inferFormats", () => {
  const cli = (overrides: object) => ({
    ...parseArgs([]),
    ...overrides
  })

  it("infers formats from file extensions", () => {
    expect(
      inferFormats(cli({ inputFile: "a.md", outputFile: "b.org" }))
    ).toEqual(["markdown", "org"])
  })

  it("infers the missing format as the opposite side", () => {
    expect(inferFormats(cli({ fromFormat: "markdown" }))).toEqual([
      "markdown",
      "org"
    ])
    expect(inferFormats(cli({ toFormat: "markdown" }))).toEqual([
      "org",
      "markdown"
    ])
  })

  it("mirrors the format for normalize", () => {
    expect(inferFormats(cli({ normalize: true, toFormat: "org" }))).toEqual([
      "org",
      "org"
    ])
  })

  it("keeps a conflicting normalize target for validation", () => {
    expect(
      inferFormats(
        cli({ normalize: true, fromFormat: "markdown", toFormat: "org" })
      )
    ).toEqual(["markdown", "org"])
    expect(
      inferFormats(
        cli({ normalize: true, inputFile: "a.md", outputFile: "b.org" })
      )
    ).toEqual(["markdown", "org"])
  })
})

describe("validateFormats", () => {
  it("rejects undeterminable formats", () => {
    expect(() => validateFormats(undefined, undefined, false)).toThrow(
      /Could not determine conversion formats/
    )
  })

  it("rejects unsupported formats, naming the value", () => {
    expect(() => validateFormats("markdown", "asciidoc", false)).toThrow(
      /Unsupported format 'asciidoc'/
    )
    expect(() => validateFormats("asciidoc", "org", false)).toThrow(
      /Unsupported format 'asciidoc'/
    )
  })

  it("points a file name at the flag that takes one", () => {
    expect(() => validateFormats("notes.md", "org", false)).toThrow(
      /--from takes a format name; for a file use --input notes\.md/
    )
    expect(() => validateFormats("markdown", "out.org", false)).toThrow(
      /--to takes a format name; for a file use --output out\.org/
    )
    // a format name that is merely wrong has no file to suggest
    expect(() => validateFormats("html", "org", false)).not.toThrow(/--input/)
  })

  it("rejects same source and target except for normalize", () => {
    expect(() => validateFormats("org", "org", false)).toThrow(
      /cannot be the same/
    )
    expect(() => validateFormats("org", "org", true)).not.toThrow()
  })

  it("rejects differing source and target for normalize", () => {
    expect(() => validateFormats("markdown", "org", true)).toThrow(
      /normalize.*same format/i
    )
  })
})

describe("resolvePreset", () => {
  it("resolves known presets and none", () => {
    expect(resolvePreset("logseq")).toBeDefined()
    expect(resolvePreset(undefined)).toBeUndefined()
  })

  it("rejects unknown presets, listing the available ones", () => {
    expect(() => resolvePreset("roam")).toThrow(
      /Unknown preset 'roam'.*logseq, obsidian/
    )
  })
})

describe("loadConfig", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "morg-cli-"))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  it("reads an explicit config path", () => {
    const file = path.join(tmp, "morg.toml")
    fs.writeFileSync(file, 'preset = "logseq"\n')
    expect(loadConfig(file)).toMatchObject({ preset: "logseq" })
  })

  it("returns an empty config without a config file", () => {
    // cwd has no morg.toml (repo root); default resolution finds nothing
    expect(loadConfig(undefined)).toEqual({})
  })

  it("rejects unreadable or invalid configs", () => {
    expect(() => loadConfig(path.join(tmp, "missing.toml"))).toThrow(CliError)
    const bad = path.join(tmp, "bad.toml")
    fs.writeFileSync(bad, "not toml [")
    expect(() => loadConfig(bad)).toThrow(/Error reading/)
  })
})

describe("buildConversionOptions", () => {
  const cli = (overrides: object) => ({ ...parseArgs([]), ...overrides })

  it("layers CLI flags over config values", () => {
    const { orgToMdOptions } = buildConversionOptions(
      cli({ markdownStyle: { emphasis: "*" } }),
      { orgToMarkdown: { markdownStyle: { emphasis: "_", bullet: "+" } } },
      undefined
    )
    expect(orgToMdOptions.markdownStyle).toMatchObject({
      emphasis: "*",
      bullet: "+"
    })
  })

  it("takes recordStyle from the config, and lets the flag override it", () => {
    const config = { markdownToOrg: { recordStyle: true } }

    expect(
      buildConversionOptions(cli({}), config, undefined).mdToOrgOptions
        .recordStyle
    ).toBe(true)
    expect(
      buildConversionOptions(cli({ recordStyle: false }), config, undefined)
        .mdToOrgOptions.recordStyle
    ).toBe(false)
  })

  it("converts ruleRepetition to a number", () => {
    const { orgToMdOptions } = buildConversionOptions(
      cli({ markdownStyle: { ruleRepetition: "5" } }),
      {},
      undefined
    )
    expect(orgToMdOptions.markdownStyle.ruleRepetition).toBe(5)
  })

  it("suppresses warnings when silent via flag or config", () => {
    expect(
      buildConversionOptions(cli({ silent: true }), {}, undefined)
        .orgToMdOptions.onWarning
    ).toBeUndefined()
    expect(
      buildConversionOptions(cli({}), { silent: true }, undefined)
        .orgToMdOptions.onWarning
    ).toBeUndefined()
    expect(
      buildConversionOptions(cli({}), {}, undefined).orgToMdOptions.onWarning
    ).toBeDefined()
  })

  it("lets an explicit CLI false override a config true", () => {
    expect(
      buildConversionOptions(
        cli({ silent: false }),
        { silent: true },
        undefined
      ).orgToMdOptions.onWarning
    ).toBeDefined()
    expect(
      buildConversionOptions(
        cli({ taskCheckboxes: false }),
        { orgToMarkdown: { taskCheckboxes: true } },
        undefined
      ).orgToMdOptions.taskCheckboxes
    ).toBe(false)
    expect(
      buildConversionOptions(
        cli({ interpretHtml: false }),
        { markdownToOrg: { interpretHtml: true } },
        undefined
      ).mdToOrgOptions.interpretHtml
    ).toBe(false)
  })
})

describe("convert", () => {
  const cli = (overrides: object) => ({ ...parseArgs([]), ...overrides })

  it("converts in both directions", () => {
    expect(convert("# Hello", "markdown", false, cli({}), {}, undefined)).toBe(
      "* Hello\n"
    )
    expect(convert("* Hello", "org", false, cli({}), {}, undefined)).toBe(
      "# Hello\n"
    )
  })

  it("records the source style when --record-style is given", () => {
    const org = convert(
      "* item\n",
      "markdown",
      false,
      cli({ recordStyle: true }),
      {},
      undefined
    )

    expect(org).toContain('#+MORG_MARKDOWN_STYLE: {"bullet":"*"}')
    expect(convert(org, "org", false, cli({}), {}, undefined)).toBe("* item\n")
  })

  it("normalizes both formats", () => {
    expect(convert("#   Hello", "markdown", true, cli({}), {}, undefined)).toBe(
      "# Hello\n"
    )
    expect(convert("*    Hello", "org", true, cli({}), {}, undefined)).toBe(
      "* Hello\n"
    )
  })

  it("reports dropped constructs as morg: warnings on stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      convert(
        '![alt](img.png "title")',
        "markdown",
        false,
        cli({}),
        {},
        undefined
      )
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^morg: .*title/))
    } finally {
      spy.mockRestore()
    }
  })

  it("wraps converter failures in a CliError", () => {
    const throwingPreset = {
      name: "throwing",
      applyToUniorg: () => {
        throw new Error("boom")
      }
    }
    expect(() =>
      convert("# x", "markdown", false, cli({}), {}, throwingPreset)
    ).toThrow(CliError)
    expect(() =>
      convert("# x", "markdown", false, cli({}), {}, throwingPreset)
    ).toThrow("Conversion error:")
  })
})

// process-boundary contract: stdin/stdout flow, files, exit codes
describe("cli process", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "morg-cli-run-"))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

  function run(args: string[], stdin?: string) {
    return new Promise<{ stdout: string; stderr: string; code: number }>(
      resolve => {
        const child = execFile(
          process.execPath,
          ["--import", "tsx", "src/cli.ts", ...args],
          (error, stdout, stderr) => {
            resolve({
              stdout,
              stderr,
              code: error && "code" in error ? (error.code as number) : 0
            })
          }
        )
        child.stdin?.end(stdin ?? "")
      }
    )
  }

  it("converts stdin to stdout in both directions", async () => {
    const md = await run(["--from", "markdown"], "# Hello")
    expect(md).toMatchObject({ stdout: "* Hello\n\n", code: 0 })
    const org = await run(["--from", "org"], "* Hello")
    expect(org).toMatchObject({ stdout: "# Hello\n\n", code: 0 })
  })

  it("decodes stdin as utf-8 across chunk boundaries", async () => {
    // a multi-byte character straddling a 64 KiB chunk boundary must survive
    const filler = "a".repeat(65535 - "# ".length)
    const result = await run(["--from", "markdown"], `# ${filler}é done\n`)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("é done")
    expect(result.stdout).not.toContain("�")
  })

  it("converts between files, inferring formats from extensions", async () => {
    const input = path.join(tmp, "in.md")
    const output = path.join(tmp, "out.org")
    fs.writeFileSync(input, "# Hello\n")
    const result = await run(["--input", input, "--output", output])
    expect(result.code).toBe(0)
    expect(fs.readFileSync(output, "utf8")).toBe("* Hello\n")
  })

  it("fails with exit code 1 and a message on invalid usage", async () => {
    const result = await run(["--from", "org", "--to", "org"], "* x")
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/cannot be the same/)
    expect(result.stdout).toBe("")
  })

  it("prints usage on --help, -h and a bare invocation", async () => {
    for (const args of [["--help"], ["-h"], []]) {
      const result = await run(args)
      expect(result.code).toBe(0)
      expect(result.stdout).toMatch(/Usage: morg/)
      expect(result.stderr).toBe("")
    }
  })

  it("prints the package version on --version", async () => {
    const { version } = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      version: string
    }
    const result = await run(["--version"])
    expect(result).toMatchObject({ stdout: `${version}\n`, code: 0 })
  })

  it("points at --help when usage is wrong", async () => {
    const result = await run(["--from", "notes.md", "--to", "out.org"])
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Unsupported format/)
    expect(result.stderr).toMatch(/morg --help/)
  })

  it("reports the failing config path with the underlying error", async () => {
    const missing = path.join(tmp, "missing.toml")
    const result = await run(["--config", missing, "--from", "org"], "* x")
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Error reading .*missing\.toml/)
    // the cause is printed alongside the message
    expect(result.stderr).toMatch(/ENOENT/)
  })
})
