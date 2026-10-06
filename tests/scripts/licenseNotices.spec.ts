import { describe, it, expect } from "vitest"
// @ts-expect-error -- plain ESM helper, no declarations emitted for scripts/
import { toNotices } from "../../scripts/licenseNotices.mjs"

interface ModuleInfo {
  licenses?: string | string[]
  repository?: string
  copyright?: string
  licenseFile?: string
  licenseText?: string
  path?: string
}
interface Notice {
  name: string
  version: string
  license: string
  repository?: string
  copyright?: string
  text?: string
}

const notices = toNotices as (report: Record<string, ModuleInfo>) => Notice[]

describe("toNotices", () => {
  it("keeps what the licenses page shows, and no local paths", () => {
    const report = {
      "uniorg@1.4.0": {
        licenses: "GPL-3.0-or-later",
        repository: "https://github.com/rasendubi/uniorg",
        copyright: "Copyright (C) 2020 Jane Doe",
        licenseFile: "/home/dev/morg/node_modules/uniorg/LICENSE",
        licenseText: "GNU GENERAL PUBLIC LICENSE",
        path: "/home/dev/morg/node_modules/uniorg"
      }
    }

    expect(notices(report)).toEqual([
      {
        name: "uniorg",
        version: "1.4.0",
        license: "GPL-3.0-or-later",
        repository: "https://github.com/rasendubi/uniorg",
        copyright: "Copyright (C) 2020 Jane Doe",
        text: "GNU GENERAL PUBLIC LICENSE"
      }
    ])
  })

  it("reads a scoped package's name and version off the report's key", () => {
    const report = { "@picocss/pico@2.1.1": { licenses: "MIT" } }

    expect(notices(report)).toEqual([
      { name: "@picocss/pico", version: "2.1.1", license: "MIT" }
    ])
  })

  it("drops the README license-checker reads where a package ships no license file", () => {
    // format and remark-math declare MIT but ship no LICENSE; the page
    // shows the identifier rather than a README posing as license text
    const report = {
      "format@0.2.2": {
        licenses: "MIT",
        copyright: "Copyright 2010 - 2014 John Doe john@example.com",
        licenseFile: "/home/dev/morg/node_modules/format/Readme.md",
        licenseText: "format\n======\n\nprintf and sprintf"
      }
    }

    expect(notices(report)).toEqual([
      {
        name: "format",
        version: "0.2.2",
        license: "MIT",
        copyright: "Copyright 2010 - 2014 John Doe john@example.com"
      }
    ])
  })
})
