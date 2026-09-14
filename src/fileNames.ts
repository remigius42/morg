/** The document formats morg reads, by file extension. */
const DOCUMENT_FORMATS = new Map<string, "markdown" | "org">([
  ["md", "markdown"],
  ["org", "org"]
])

/**
 * Splits a file name into the part a derived name keeps and the extension
 * that carries its format. A dotless name and a dotfile both have no
 * extension — `org` is a file called org, and `.org` is a hidden file whose
 * name happens to start with a dot.
 */
export function splitFileName(name: string): {
  stem: string
  extension: string
} {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) {
    return { stem: name, extension: "" }
  }
  return {
    stem: name.slice(0, dot),
    extension: name.slice(dot + 1).toLowerCase()
  }
}

/** The format a file name implies, or undefined if it implies none. */
export function formatFromFileName(
  name: string
): "markdown" | "org" | undefined {
  return DOCUMENT_FORMATS.get(splitFileName(name).extension)
}
