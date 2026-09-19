/** The document formats morg reads, by file extension. */
const DOCUMENT_FORMATS = new Map<string, "markdown" | "org">([
  ["md", "markdown"],
  ["org", "org"]
])

/**
 * Splits a file name into the part a derived name keeps and the extension
 * that carries its format. A dotless name and a dotfile both have no
 * extension: `org` is a file called org, and `.org` is a hidden file whose
 * name happens to start with a dot.
 *
 * The extension comes from the last path segment, since the CLI is handed
 * paths rather than the bare names the Web UI reads off a `File`; the stem
 * keeps any directory, being the part a derived name builds on.
 */
export function splitFileName(name: string): {
  stem: string
  extension: string
} {
  const base = name.slice(lastSeparator(name) + 1)
  const dot = base.lastIndexOf(".")
  if (dot <= 0) {
    return { stem: name, extension: "" }
  }
  return {
    stem: name.slice(0, name.length - base.length + dot),
    extension: base.slice(dot + 1).toLowerCase()
  }
}

/** Index of the last path separator, or -1. Windows accepts both. */
function lastSeparator(name: string): number {
  return Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"))
}

/** The format a file name implies, or undefined if it implies none. */
export function formatFromFileName(
  name: string
): "markdown" | "org" | undefined {
  return DOCUMENT_FORMATS.get(splitFileName(name).extension)
}
