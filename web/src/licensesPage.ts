// Entry for web/licenses.html; the lists are written before every build
// by scripts/write-licenses.mjs.
import { showNotices } from "./licenses.js"

for (const scope of ["production", "development"]) {
  const body = document.getElementById(scope) as HTMLTableSectionElement
  void showNotices(body, `./licenses-${scope}.json`)
}
