/**
 * A labeled org fuzzy link in text (`[[Page][label]]`): the form a
 * translation's page links pass through between two Markdown dialects
 * (`MarkdownDialect.links`), as a conversion's pass through org.
 */
export const FUZZY_LINK_RE = /\[\[([^\][]+)\]\[([^\][]+)\]\]/g
