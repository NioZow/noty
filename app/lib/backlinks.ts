/**
 * Backlinks index for wiki-style bidirectional linking.
 *
 * Port of the original Python `src/renderer/backlinks.py`.
 * Builds a mapping from note path → list of pages that link TO that note.
 *
 * CRITICAL FOR PERFORMANCE: `getBacklinks()` is **non-blocking**.
 * On a cold cache it returns `[]` immediately and kicks off a background
 * build.  The next request (or page navigation) gets the populated index.
 *
 * Caches live on `globalThis` so they survive Turbopack dev-server module
 * invalidation.
 *
 * @module backlinks
 */

import { readdir, stat, readFile } from "node:fs/promises";
import path from "node:path";
import { notesDir } from "./config";

const _WIKI_LINK_RE = /\[\[([^\]|]+)(?:|[^\]]+)?\]\]/g;
const _FRONTMATTER_RE = /^---\n[^]*?\n---\n/;

const _TTL_MS = 300_000; // 5 minutes

/** A single backlink entry. */
export interface Backlink {
  name: string;
  path: string;
}

interface CacheEntry {
  ts: number;
  index: Map<string, Backlink[]>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface GlobalBacklinksCache {
  __backlinks_cache?: Map<string, CacheEntry>;
  __backlinks_building?: boolean;
  __backlinks_buildPromise?: Promise<void> | null;
}
const _global = globalThis as unknown as GlobalBacklinksCache;
/* eslint-enable @typescript-eslint/no-explicit-any */

if (!_global.__backlinks_cache) {
  _global.__backlinks_cache = new Map();
}

// Eager background build on first module load so the cache is warm
// before the first HTTP request arrives.
{
  const root = path.resolve(notesDir());
  const cacheKey = root;
  const now = Date.now();
  const cached = _global.__backlinks_cache!.get(cacheKey);
  if (!cached || now - cached.ts >= _TTL_MS) {
    startBackgroundBuild(root, cacheKey);
  }
}

// ---------------------------------------------------------------------------
// Public API — non-blocking
// ---------------------------------------------------------------------------

/**
 * Return backlinks for the note identified by *relPath*.
 *
 * This function **never blocks**: if the index is stale or missing it returns
 * `[]` immediately while a background build may already be in progress.
 */
export async function getBacklinks(relPath: string): Promise<Backlink[]> {
  const root = path.resolve(notesDir());
  const cacheKey = root;
  const now = Date.now();
  const cache = _global.__backlinks_cache!;
  const cached = cache.get(cacheKey);

  if (cached && now - cached.ts < _TTL_MS) {
    return cached.index.get(relPath) ?? [];
  }

  // Cache missing or expired: return immediately, ensure background build
  // has started (usually already started at module-load time above).
  startBackgroundBuild(root, cacheKey);
  return [];
}

/**
 * Invalidate the backlinks cache (call after file changes).
 */
export function invalidateBacklinksCache(): void {
  _global.__backlinks_cache!.clear();
  _global.__backlinks_building = false;
  _global.__backlinks_buildPromise = null;
}

// ---------------------------------------------------------------------------
// Background build — never awaited by the request path
// ---------------------------------------------------------------------------

function startBackgroundBuild(root: string, cacheKey: string): void {
  if (_global.__backlinks_building) return; // already in-flight

  _global.__backlinks_building = true;
  _global.__backlinks_buildPromise = _buildIndex(root)
    .then((index) => {
      _global.__backlinks_cache!.set(cacheKey, { ts: Date.now(), index });
    })
    .catch(() => {
      // ignore background errors
    })
    .finally(() => {
      _global.__backlinks_building = false;
      _global.__backlinks_buildPromise = null;
    });
}

// ---------------------------------------------------------------------------
// Index builder — single-pass async scan
// ---------------------------------------------------------------------------

async function _buildIndex(root: string): Promise<Map<string, Backlink[]>> {
  const index = new Map<string, Backlink[]>();

  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    let processed = 0;
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      let st;
      try {
        st = await stat(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        await walk(full);
      } else if (st.isFile() && path.extname(entry).toLowerCase() === ".md") {
        const rel = path.relative(root, full);
        const source = await safeReadFile(full);
        if (!source) continue;

        // Strip frontmatter so we don't count links inside YAML
        const body = source.replace(_FRONTMATTER_RE, "");

        for (const m of body.matchAll(_WIKI_LINK_RE)) {
          const targetRaw = m[1].trim();
          const resolved = await _findNote(root, targetRaw);
          if (!resolved) continue;

          const name = path.basename(full, ".md").replace(/[-_]/g, " ");
          const titleName = name.charAt(0).toUpperCase() + name.slice(1);

          if (!index.has(resolved)) {
            index.set(resolved, []);
          }
          const list = index.get(resolved)!;
          if (!list.some((b) => b.path === rel)) {
            list.push({ name: titleName, path: rel });
          }
        }
      }

      // Yield to the event loop every 50 entries so HTTP handlers don't stall
      processed++;
      if (processed % 50 === 0) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }
  }

  await walk(root);
  return index;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _findNote(root: string, target: string): Promise<string | undefined> {
  const t = target.toLowerCase().trim();
  const slug = _slugify(t);
  return _findNoteInDir(root, root, t, slug);
}

async function _findNoteInDir(root: string, dir: string, stem: string, slug: string): Promise<string | undefined> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = await stat(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      const deeper = await _findNoteInDir(root, full, stem, slug);
      if (deeper) return deeper;
    } else if (st.isFile() && path.extname(entry).toLowerCase() === ".md") {
      const name = path.basename(entry, ".md").toLowerCase();
      if (name === stem || _slugify(name) === slug) {
        return path.relative(root, full);
      }
    }
  }
  return undefined;
}

function _slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[ _]/g, "-")
    .replace(/\.md$/i, "");
}

// ---------------------------------------------------------------------------
// Safe helpers
// ---------------------------------------------------------------------------

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
