// Runs before every Web UI build and dev server start (`prebuild:web`,
// `predev:web`): writes the license notices web/licenses.html shows, one
// file per dependency scope, into web/public/, which the build copies to
// the site root. Why both scopes and not the bundle's own list:
// docs/adr/0008-third-party-licenses-page.md.
import { writeFileSync } from "node:fs"
import process from "node:process"
import { promisify } from "node:util"
import { init } from "license-checker-rseidelsohn"
import { toNotices } from "./licenseNotices.mjs"

const check = promisify(init)

for (const scope of ["production", "development"]) {
  const report = await check({
    start: ".",
    [scope]: true,
    excludePackages: "@remigius42/morg",
    customFormat: { licenseText: "", copyright: "" }
  })
  const file = `web/public/licenses-${scope}.json`
  writeFileSync(file, `${JSON.stringify(toNotices(report))}\n`)
  process.stdout.write(`${file}: ${Object.keys(report).length} packages\n`)
}
