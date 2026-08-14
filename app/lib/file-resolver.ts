/**
 * Server-side file resolver with path traversal guards.
 *
 * @module file-resolver
 */

import { readdirSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { notesDir } from "./config";
import type { NoteTreeEntry } from "./types";

/**
 * Resolve a relative URL slug to an absolute file path under the notes
 * directory, guarding against directory traversal attacks.
 */
export async function resolveNotePath(slug: string): Promise<string> {
  const root = path.resolve(notesDir());
  const normalized = slug.replace(/\/$/, ""); // drop trailing slash

  const rootName = path.basename(root);
  if (rootName && (normalized === rootName || normalized.startsWith(`${rootName}/`))) {
    throw new TraverseError("Alias URL blocked", 404);
  }

  const absolute = path.resolve(path.join(root, normalized));
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TraverseError("Path traversal blocked", 403);
  }

  return absolute;
}

export class TraverseError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = "TraverseError";
  }
}

/**
 * Read a markdown file and return its raw contents as UTF-8.
 */
export async function readMarkdownFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    throw new TraverseError("File unreadable", 500);
  }
}

/**
 * Build ONLY the root-level entries for the sidebar (fast, no recursion).
 *
 * The client-side TreeItem lazily fetches children on expand via /api/tree.
 */
export function buildNoteTree(currentPath: string = ""): NoteTreeEntry[] {
  const root = path.resolve(notesDir());
  const entries = tryReaddir(root);
  const items: NoteTreeEntry[] = [];

  for (const child of entries.sort()) {
    if (child.startsWith(".")) continue;
    const full = path.join(root, child);
    const st = safeStatSync(full);
    if (!st) continue;
    if (st.isSymbolicLink()) continue;
    const rel = path.relative(root, full).replace(/\\/g, "/");
    const isActive = rel ? currentPath === rel || currentPath.startsWith(rel + "/") : false;

    if (st.isDirectory()) {
      items.push({
        name: child,
        url: `/${rel}/`,
        is_dir: true,
        is_active: isActive,
        depth: 0,
        children: [],
      });
    } else if (path.extname(child).toLowerCase() === ".md") {
      items.push({
        name: path.basename(child, ".md"),
        url: `/${rel}`,
        is_dir: false,
        is_active: isActive,
        depth: 0,
        children: [],
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryReaddir(dirPath: string): string[] {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function safeStatSync(filePath: string) {
  try {
    const st = lstatSync(filePath);
    if (st.isSymbolicLink()) return null;
    return st;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tag helpers (stubs — can be expanded to scan markdown frontmatter)
// ---------------------------------------------------------------------------

export async function collectAllTags(): Promise<string[]> {
  // TODO: scan all .md frontmatter for tags
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function findNotesByTag(tag: string): Promise<{ path: string; name: string }[]> {
  // TODO: scan all .md frontmatter for given tag
  return [];
}
