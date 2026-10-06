// `npm run licenses:check`, in CI: fails on a production dependency whose
// license is not GPL-3.0-compatible. Production only: it is what ships,
// in the npm package and the Web UI (docs/adr/0008-third-party-licenses-page.md).
import process from "node:process"
import { promisify } from "node:util"
import { init } from "license-checker-rseidelsohn"
import { disallowedLicenses } from "./licenseCheck.mjs"

const ALLOWED = [
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "GPL-3.0-or-later",
  "0BSD"
]

const report = await promisify(init)({ start: ".", production: true })
const offending = disallowedLicenses(report, ALLOWED)
if (offending.length > 0) {
  process.stderr.write(
    `Licenses not allowed (${ALLOWED.join(", ")}):\n${offending.join("\n")}\n`
  )
  process.exit(1)
}
process.stdout.write(`${Object.keys(report).length} packages, all allowed\n`)
