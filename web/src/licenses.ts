/** One package's entry, as scripts/licenseNotices.mjs writes it. */
export interface LicenseNotice {
  name: string
  version: string
  license: string
  copyright?: string
  text?: string
}

/**
 * Fills a table body with one row per package: name, version, license,
 * the license text folded away under the license's name, or the
 * copyright line where there is no text.
 * @param body The `<tbody>` to fill; its previous rows are replaced.
 * @param notices The packages, in display order.
 */
export function renderNotices(
  body: HTMLTableSectionElement,
  notices: LicenseNotice[]
): void {
  body.replaceChildren(
    ...notices.map(notice => {
      const row = document.createElement("tr")
      const link = document.createElement("a")
      link.href = `https://www.npmjs.com/package/${notice.name}/v/${notice.version}`
      link.textContent = notice.name
      row.append(cell(link), cell(notice.version), cell(...license(notice)))
      return row
    })
  )
}

/**
 * Loads a list written by scripts/write-licenses.mjs into a table body,
 * or a row saying it could not be loaded.
 * @param body The `<tbody>` to fill.
 * @param url Where the list is, relative to the page.
 */
export async function showNotices(
  body: HTMLTableSectionElement,
  url: string
): Promise<void> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`)
    }
    renderNotices(body, (await response.json()) as LicenseNotice[])
  } catch {
    const row = document.createElement("tr")
    const message = cell("The license list could not be loaded.")
    message.colSpan = 3
    row.append(message)
    body.replaceChildren(row)
  }
}

function license(notice: LicenseNotice): (Node | string)[] {
  if (!notice.text) {
    // the package ships no license file; its copyright line, read from
    // the README, is the notice there is
    if (!notice.copyright) {
      return [notice.license]
    }
    const copyright = document.createElement("small")
    copyright.textContent = notice.copyright
    return [notice.license, document.createElement("br"), copyright]
  }
  const details = document.createElement("details")
  const summary = document.createElement("summary")
  summary.textContent = notice.license
  const text = document.createElement("pre")
  text.textContent = notice.text
  // it scrolls sideways within its cell, which a keyboard can only do
  // once it has focus
  text.tabIndex = 0
  details.append(summary, text)
  return [details]
}

function cell(...content: (Node | string)[]): HTMLTableCellElement {
  const element = document.createElement("td")
  element.append(...content)
  return element
}
