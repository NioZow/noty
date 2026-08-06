/**
 * Small markdown/frontmatter helpers shared by the sync modules.
 *
 * Port of the pieces of the original Python codebase that both
 * `challenge_parser.py` and `vulnerability_parser.py` relied on:
 *
 * - `_clean_cell()`      — strip basic markdown formatting from a text cell
 * - `extract_frontmatter()` from `parser.py` — parse YAML frontmatter with the
 *   exact same filtering rules (hidden fields such as `title`, empty values
 *   dropped, invalid YAML tolerated)
 * - `str.title()`        — Python-style title-casing for fallback names
 *
 * @module markdown-utils
 */

import matter from "gray-matter";

/**
 * Result of {@link extractFrontmatter}.
 *
 * Matches the Python `(metadata_dict, body_without_frontmatter)` tuple.
 */
export interface FrontmatterResult {
  /** Filtered frontmatter metadata (see {@link extractFrontmatter}). */
  meta: Record<string, unknown>;
  /** The document body with the frontmatter block removed. */
  body: string;
}

/**
 * Fields that are decorative / redundant with the page heading — hidden from
 * the metadata dict, exactly as in the Python `_HIDDEN_FIELDS = {"title"}`.
 */
const HIDDEN_FIELDS: ReadonlySet<string> = new Set(["title"]);

/**
 * Strip basic markdown formatting from a text cell.
 *
 * Removes `**bold**`, `*emphasis*` and `` `code` `` markers, mirroring the
 * Python `_clean_cell()` helper. Simple regex-based stripping is sufficient
 * here because the input is short, single-line metadata text.
 *
 * @param text - The markdown-formatted text
 * @returns The plain text with formatting markers removed
 */
export function cleanCell(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*(.*?)\*/g, "$1");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
  return cleaned.trim();
}

/**
 * Apply the Python `extract_frontmatter()` filtering rules to parsed YAML
 * data: hidden fields (`title`), `null` values, blank strings and empty
 * lists are all dropped.
 *
 * @param data - The raw parsed frontmatter object
 * @returns The filtered metadata record
 */
function filterMetadata(data: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (HIDDEN_FIELDS.has(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" && value.trim() === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

/**
 * Split a markdown source string into `(meta, body)`.
 *
 * Uses `gray-matter` for the YAML frontmatter parsing and then applies the
 * same filtering as the Python `extract_frontmatter()`. If the frontmatter
 * block is missing or contains invalid YAML, the result is an empty metadata
 * record and the unchanged source — mirroring the Python behaviour of
 * swallowing `yaml.YAMLError`.
 *
 * @param source - The raw markdown file contents
 * @returns The filtered metadata and the body without frontmatter
 */
export function extractFrontmatter(source: string): FrontmatterResult {
  try {
    const parsed = matter(source);
    return { meta: filterMetadata(parsed.data), body: parsed.content };
  } catch {
    // mirrors Python's `except yaml.YAMLError: raw = {}`.
    return { meta: {}, body: source };
  }
}

/**
 * Extract the text of the first `# Heading` (ATX H1) line in a body.
 *
 * Scans line by line for a line starting with `# `, exactly like the Python
 * parsers' `line.startswith("# ")` loop.
 *
 * @param body - Markdown body (frontmatter already stripped)
 * @returns The heading text, or `""` when no H1 is present
 */
export function extractFirstH1(body: string): string {
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return "";
}

/**
 * Python `str.title()` equivalent: uppercase the first letter of every word
 * and lowercase the rest, where non-alphabetic characters act as word
 * separators (e.g. `"rsa-basics"` → `"Rsa Basics"` after separator handling by
 * the caller, `"they're"` → `"They'Re"`).
 *
 * @param input - The string to title-case
 * @returns The title-cased string
 */
export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(
      /(^|[^a-zA-Z])([a-zA-Z])/g,
      (_match: string, separator: string, letter: string) =>
        separator + letter.toUpperCase(),
    );
}
