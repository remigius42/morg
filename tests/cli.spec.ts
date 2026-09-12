import { execFile } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"
import { parseArgs } from "../src/cli/args.js"
import { loadConfig } from "../src/cli/configFile.js"
import { resolvePreset } from "../src/cli/presets.js"
import { inferFormats, validateFormats } from "../src/cli/formats.js"
import { buildConversionOptions, convert } from "../src/cli/conversion.js"
import { CliError } from "../src/cli/error.js"

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

  it("rejects unknown arguments", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(CliError)
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown argument: --bogus")
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
})

describe("validateFormats", () => {
  it("rejects undeterminable formats", () => {
    expect(() => validateFormats(undefined, undefined, false)).toThrow(
      /Could not determine conversion formats/
    )
  })

  it("rejects unsupported formats", () => {
    expect(() => validateFormats("markdown", "asciidoc", false)).toThrow(
      /Unsupported format/
    )
  })

  it("rejects same source and target except for normalize", () => {
    expect(() => validateFormats("org", "org", false)).toThrow(
      /cannot be the same/
    )
    expect(() => validateFormats("org", "org", true)).not.toThrow()
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

  it("reports the failing config path with the underlying error", async () => {
    const missing = path.join(tmp, "missing.toml")
    const result = await run(["--config", missing, "--from", "org"], "* x")
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/Error reading .*missing\.toml/)
    // the cause is printed alongside the message
    expect(result.stderr).toMatch(/ENOENT/)
  })
})
