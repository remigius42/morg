import { basename } from "node:path"

/**
 * Turns a license-checker report into what the Web UI's licenses page
 * shows. Only the listed fields leave: the report also carries absolute
 * paths into the machine that built it, and, for a package that ships
 * no license file, its README in place of the license text.
 * @param {Record<string, import("license-checker-rseidelsohn").ModuleInfo>} report
 *   license-checker's `init` result, keyed `name@version`.
 * @returns {{ name: string, version: string, license: string,
 *   copyright?: string, text?: string }[]}
 *   One notice per package, in the report's order.
 */
export function toNotices(report) {
  return Object.entries(report).map(([key, info]) => ({
    // the last `@`: a scoped name starts with one
    name: key.slice(0, key.lastIndexOf("@")),
    version: key.slice(key.lastIndexOf("@") + 1),
    license: [info.licenses].flat().join(" OR "),
    ...(info.copyright && { copyright: info.copyright }),
    ...(info.licenseText &&
      !isReadme(info.licenseFile) && { text: info.licenseText })
  }))
}

/** license-checker's last resort when a package has no license file. */
function isReadme(file = "") {
  return /^readme/i.test(basename(file))
}
