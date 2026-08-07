/**
 * Server-side markdown processing: frontmatter extraction plus
 * pre-processing hooks for wiki-links, vuln-links, and image-bg.
 *
 * Caches live on `globalThis` so they survive Turbopack dev-server module
 * invalidation.
 *
 * @module render-markdown
 */

import path from "node:path";
import { existsSync, readdirSync, lstatSync } from "node:fs";
import { readdir, lstat, readFile } from "node:fs/promises";
import { extractFrontmatter, extractFirstH1 } from "./markdown-utils";
import { notesDir } from "./config";
import { resolveNotePath, TraverseError } from "./file-resolver";
import { getBacklinks } from "./backlinks";
import { FEAT_WIKI_LINKS, FEAT_VULN_LINKS } from "./features";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface GlobalRenderMarkdownCache {
  _renderCache?: Map<string, { slug: string; promise: Promise<RenderedNote>; ts: number }>;
  _wikiCache?: { root: string; lookup: Map<string, string>; ts: number } | null;
  _wikiCacheBuilding?: boolean;
  _vulnCache?: { root: string; dirs: Set<string>; ts: number } | null;
  _vulnCacheBuilding?: boolean;
}
const _global = globalThis as unknown as GlobalRenderMarkdownCache;
/* eslint-enable @typescript-eslint/no-explicit-any */

if (!_global._renderCache) {
  _global._renderCache = new Map();
}

const _RENDER_CACHE_TTL = 60_000;
const _WIKI_CACHE_TTL = 300_000;
const _VULN_CACHE_TTL = 300_000;

// Eager background builds on module load
{
  const root = path.resolve(notesDir());
  const now = Date.now();
  const wikiCached = _global._wikiCache;
  if (!wikiCached || wikiCached.root !== root || now - wikiCached.ts >= _WIKI_CACHE_TTL) {
    startWikiBuild(root);
  }
  const vulnCached = _global._vulnCache;
  if (!vulnCached || vulnCached.root !== root || now - vulnCached.ts >= _VULN_CACHE_TTL) {
    startVulnBuild(root);
  }
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export interface RenderedNote {
  title: string;
  relPath: string;
  meta: Record<string, unknown>;
  body: string;
  date: string;
  backlinks: Awaited<ReturnType<typeof getBacklinks>>;
  chessConfig?: Record<string, unknown>;
}

export async function renderNotePage(slug: string): Promise<RenderedNote> {
  const now = Date.now();
  const cached = _global._renderCache!.get(slug);

  // Never use the render cache in dev mode — files change frequently and
  // the watcher lives in a separate process so cache invalidation doesn't
  // reach the Next.js server reliably.
  if (
    process.env.NODE_ENV !== "development" &&
    cached &&
    now - cached.ts < _RENDER_CACHE_TTL
  ) {
    return cached.promise;
  }

  const promise = _renderNotePageUncached(slug);
  _global._renderCache!.set(slug, { slug, promise, ts: now });
  return promise;
}

export function invalidateRenderCache(): void {
  _global._renderCache!.clear();
}

// ---------------------------------------------------------------------------
// Uncached render
// ---------------------------------------------------------------------------

async function _renderNotePageUncached(slug: string): Promise<RenderedNote> {
  const filePath = await resolveNotePath(slug);

  if (!existsSync(filePath)) {
    throw new TraverseError("Note not found", 404);
  }

  const source = await readFile(filePath, "utf-8");
  const { meta, body } = extractFrontmatter(source);

  const chessConfig = (meta.chess_board as Record<string, unknown> | undefined) ?? undefined;
  let cleanedMeta = meta;
  if ("chess_board" in cleanedMeta) {
    const { chess_board: _, ...rest } = cleanedMeta;
    cleanedMeta = rest;
  }

  const h1 = extractFirstH1(body) ?? extractFirstH1(source);
  const fileNameTitle = path.basename(slug, ".md").replace(/[-_]/g, " ");
  const title =
    h1 || (typeof cleanedMeta.title === "string" ? cleanedMeta.title : fileNameTitle);

  const st = await safeStat(filePath);
  const mtime = st ? st.mtime : new Date();
  const date =
    typeof cleanedMeta.date === "string"
      ? cleanedMeta.date
      : mtime.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "2-digit",
        });

  const processedBody = preprocessMarkdown(stripFirstH1(body), path.dirname(filePath));
  const backlinks = await getBacklinks(slug);

  return {
    title,
    relPath: slug,
    meta: cleanedMeta,
    body: processedBody,
    date,
    backlinks,
    chessConfig,
  };
}

// ---------------------------------------------------------------------------
// Pre-processing
// ---------------------------------------------------------------------------

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const VULN_LINK_RE = /#\[([^\]]*)\]\(([^)]+)\)/g;
const IMAGE_BG_RE = /!\[([^\]]*)\]\(([^)]+)\s+(#[0-9a-fA-F]{6})\)/g;

function preprocessMarkdown(source: string, docDir: string): string {
  let out = source;

  if (FEAT_WIKI_LINKS) {
    const wikiLookup = getWikiLookup();
    out = out.replace(WIKI_LINK_RE, (_match, targetRaw, displayRaw) => {
      const target = targetRaw.trim();
      const display = (displayRaw ?? target).trim();
      const resolved = resolveWikiLink(wikiLookup, target);
      if (resolved) {
        return `<a href="${resolved}" data-wiki="${escapeHtml(target)}">${escapeHtml(display)}</a>`;
      }
      return `<span data-wiki-missing="true">${escapeHtml(display)}</span>`;
    });
  }

  if (FEAT_VULN_LINKS) {
    out = out.replace(VULN_LINK_RE, (_match, displayRaw, slugRaw) => {
      const display = displayRaw.trim();
      const slug = slugRaw.trim();
      const resolved = resolveVulnLink(slug);
      if (resolved) {
        return `<a href="${resolved}" data-vuln="${escapeHtml(slug)}">${escapeHtml(display)}</a>`;
      }
      return `<span data-vuln-missing="true">${escapeHtml(display)}</span>`;
    });
  }

  out = out.replace(IMAGE_BG_RE, (_match, alt, url, color) => {
    const safeUrl = resolveImageUrl(url.trim(), docDir);
    return `<img src="${escapeHtml(safeUrl)}" alt="${escapeHtml(alt)}" data-bg="${color.toLowerCase()}" />`;
  });

  out = rewriteReadmeMdLinks(out);

  return out;
}

// ---------------------------------------------------------------------------
// Wiki-link resolution — non-blocking
// ---------------------------------------------------------------------------

function getWikiLookup(): Map<string, string> {
  const root = path.resolve(notesDir());
  const cached = _global._wikiCache;
  if (cached && cached.root === root) {
    return cached.lookup;
  }
  // Cold: return empty, background build already started at module load
  return new Map();
}

function startWikiBuild(root: string): void {
  if (_global._wikiCacheBuilding) return;
  _global._wikiCacheBuilding = true;

  const lookup = new Map<string, string>();

  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      let st;
      try {
        st = await lstat(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        await walk(full);
      } else if (st.isFile() && path.extname(entry).toLowerCase() === ".md") {
        const rel = "/" + path.relative(root, full).replace(/\\/g, "/");
        const stem = path.basename(entry, ".md").toLowerCase();
        const slug = stem.replace(/[ _]/g, "-");
        if (!lookup.has(stem)) lookup.set(stem, rel);
        if (!lookup.has(slug)) lookup.set(slug, rel);
      }
    }
  }

  walk(root)
    .then(() => {
      _global._wikiCache = { root, lookup, ts: Date.now() };
    })
    .catch(() => {
      // ignore
    })
    .finally(() => {
      _global._wikiCacheBuilding = false;
    });
}

function resolveWikiLink(lookup: Map<string, string>, target: string): string | null {
  const t = target.toLowerCase().trim();
  const slug = t.replace(/[ _]/g, "-");
  return lookup.get(t) ?? lookup.get(slug) ?? null;
}

export async function invalidateWikiCache(): Promise<void> {
  _global._wikiCache = null;
  _global._wikiCacheBuilding = false;
}

export function invalidateVulnCache(): void {
  _global._vulnCache = null;
  _global._vulnCacheBuilding = false;
}

// ---------------------------------------------------------------------------
// Vulnerability-link resolution — non-blocking
// ---------------------------------------------------------------------------

function getVulnSet(root: string): Set<string> {
  const cached = _global._vulnCache;
  if (cached && cached.root === root) {
    return cached.dirs;
  }
  return new Set();
}

function startVulnBuild(root: string): void {
  if (_global._vulnCacheBuilding) return;
  _global._vulnCacheBuilding = true;

  const dirs = new Set<string>();

  async function walk(dir: string) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const full = path.join(dir, entry);
      let st;
      try {
        st = await lstat(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink() || !st.isDirectory()) continue;
      if (entry.toLowerCase() === "vulnerabilities") {
        try {
          const children = await readdir(full);
          for (const child of children) {
            const childFull = path.join(full, child);
            let childSt;
            try {
              childSt = await lstat(childFull);
            } catch {
              continue;
            }
            if (childSt.isSymbolicLink() || !childSt.isDirectory()) continue;
            dirs.add(child.toLowerCase());
            dirs.add(child.toLowerCase().replace(/[ _]/g, "-"));
          }
        } catch {
          // ignore
        }
      } else {
        await walk(full);
      }
    }
  }

  walk(root)
    .then(() => {
      _global._vulnCache = { root, dirs, ts: Date.now() };
    })
    .catch(() => {
      // ignore
    })
    .finally(() => {
      _global._vulnCacheBuilding = false;
    });
}

function resolveVulnLink(slug: string): string | null {
  const root = path.resolve(notesDir());
  const dirs = getVulnSet(root);
  const slugLower = slug.toLowerCase().trim();
  const slugKebab = slugLower.replace(/[ _]/g, "-");

  if (!dirs.has(slugLower) && !dirs.has(slugKebab)) {
    return null;
  }

  return _findVulnDirSync(root, root, slugLower, slugKebab);
}

function _findVulnDirSync(root: string, dir: string, slugLower: string, slugKebab: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.toLowerCase() === "vulnerabilities") {
      try {
        const children = readdirSync(path.join(dir, entry));
        for (const child of children) {
          const childLower = child.toLowerCase();
          if (childLower === slugLower || childLower.replace(/[ _]/g, "-") === slugKebab) {
            return "/" + path.relative(root, path.join(dir, entry, child)).replace(/\\/g, "/") + "/";
          }
        }
      } catch {
        return null;
      }
      return null;
    }
    const full = path.join(dir, entry);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory() && !st.isSymbolicLink()) {
      const deeper = _findVulnDirSync(root, full, slugLower, slugKebab);
      if (deeper) return deeper;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function resolveImageUrl(url: string, docDir: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("//") ||
    url.startsWith("/")
  ) {
    return url;
  }
  const rel = path.relative(path.resolve(notesDir()), path.resolve(docDir, url)).replace(/\\/g, "/");
  return "/" + rel;
}

// ---------------------------------------------------------------------------
// README.md link normalisation
// ---------------------------------------------------------------------------

function rewriteReadmeMdLinks(source: string): string {
  return source.replace(
    /\[([^\]]+)\]\(([^)]+)\)/gi,
    (match, text, url) => {
      const decoded = decodeURIComponent(url);
      const pathPart = decoded.split("#")[0];
      const lower = pathPart.toLowerCase();
      if (!lower.endsWith("readme.md")) return match;

      const fragment = decoded.includes("#") ? "#" + decoded.split("#", 2)[1] : "";
      const idx = lower.lastIndexOf("readme.md");
      let prefix = decoded.slice(0, idx);
      if (prefix === "") prefix = "./";
      else if (!prefix.endsWith("/")) prefix += "/";
      return `[${text}](${prefix + fragment})`;
    },
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function safeStat(filePath: string) {
  try {
    const { stat } = await import("node:fs/promises");
    return await stat(filePath);
  } catch {
    return null;
  }
}

function stripFirstH1(body: string): string {
  return body.replace(/^#\s+.*\n?/m, "").trim();
}
