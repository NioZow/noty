/**
 * MCP (Model Context Protocol) tool implementations for the markdown-render
 * rewrite.
 *
 * Ported from the original Python `src/renderer/mcp_server.py` into TypeScript.
 * Every tool returns a plain JSON-serialisable object (the caller is responsible
 * for `JSON.stringify`).
 *
 * @module mcp-tools
 */

import { existsSync, readdirSync, lstatSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { notesDir } from "../config";
import { isBinaryFile } from "../file-utils";
import { extractFrontmatter } from "../markdown-utils";
import { getBacklinks } from "../backlinks";
import { prisma } from "../prisma";

// ---------------------------------------------------------------------------
// Input types (Zod-derived shapes)
// ---------------------------------------------------------------------------

export interface ListFilesInput {
  directory?: string;
  extension?: string;
  limit?: number;
  offset?: number;
}

export interface ReadNoteInput {
  path: string;
  format?: string; // "raw" | "rendered"
}

export interface SearchInput {
  query: string;
  directory?: string;
  limit?: number;
}

export interface TagInput {
  tag: string;
}

export interface PathInput {
  path: string;
}

export interface ListChallengesInput {
  category?: string;
  platform?: string;
  tag?: string;
  solved_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetChallengeInput {
  name_or_path: string;
}

export interface GetFrontmatterInput {
  path: string;
}

export interface RenderMarkdownInput {
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getNotesDir(): string {
  return path.resolve(notesDir());
}

function validatePath(relPath: string): string {
  const root = getNotesDir();
  const target = path.resolve(path.join(root, relPath));
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path traversal blocked: ${relPath}`);
  }
  return target;
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

function safeReaddir(dirPath: string): Promise<string[]> {
  return readdir(dirPath).catch(() => []);
}

function safeReadFile(filePath: string): Promise<string | null> {
  return readFile(filePath, "utf-8").catch(() => null);
}

// ---------------------------------------------------------------------------
// Tool: notes_list_files
// ---------------------------------------------------------------------------

export async function listFiles(input: ListFilesInput): Promise<Record<string, unknown>> {
  const root = getNotesDir();
  const directory = input.directory ?? "";
  const extension = input.extension ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);

  const scope = path.resolve(path.join(root, directory));
  const scopeRel = path.relative(root, scope);
  if (scopeRel.startsWith("..") || path.isAbsolute(scopeRel)) {
    return { error: "Invalid directory scope", files: [], total: 0 };
  }
  if (!existsSync(scope)) {
    return { error: `Directory not found: ${directory}`, files: [], total: 0 };
  }

  const files: string[] = [];

  function walk(dir: string) {
    for (const child of readdirSync(dir)) {
      if (child.startsWith(".")) continue;
      const full = path.join(dir, child);
      const st = safeStatSync(full);
      if (st?.isDirectory()) {
        walk(full);
      } else if (st?.isFile()) {
        const rel = path.relative(root, full);
        if (extension) {
          const ext = extension.toLowerCase().replace(/^\./, "");
          if (!child.toLowerCase().endsWith(ext) && !child.toLowerCase().endsWith(`.${ext}`)) {
            continue;
          }
        }
        files.push(rel);
      }
    }
  }

  walk(scope);
  files.sort();

  const total = files.length;
  const sliced = files.slice(offset, offset + limit);
  return { files: sliced, total, offset, limit };
}

// ---------------------------------------------------------------------------
// Tool: notes_read_note
// ---------------------------------------------------------------------------

export async function readNote(input: ReadNoteInput): Promise<Record<string, unknown>> {
  const { path: relPath, format = "raw" } = input;
  let filePath: string;
  try {
    filePath = validatePath(relPath);
  } catch (exc) {
    return { error: String(exc) };
  }

  if (!existsSync(filePath)) {
    return { error: `File not found: ${relPath}` };
  }

  const st = safeStatSync(filePath);
  if (st?.isDirectory()) {
    return { error: `Path is a directory: ${relPath}` };
  }

  if (await isBinaryFile(filePath)) {
    return {
      path: relPath,
      is_binary: true,
      content: null,
      error: "Binary files cannot be read as text",
    };
  }

  try {
    const raw = await readFile(filePath, "utf-8");
    const { meta, body } = extractFrontmatter(raw);

    if (format === "rendered") {
      const html = await renderMarkdownToHtml(body);
      return {
        path: relPath,
        is_binary: false,
        frontmatter: meta,
        content: html,
      };
    }

    return {
      path: relPath,
      is_binary: false,
      frontmatter: meta,
      content: body,
    };
  } catch (exc) {
    return { error: `Failed to read ${relPath}: ${exc}` };
  }
}

// ---------------------------------------------------------------------------
// Tool: notes_search
// ---------------------------------------------------------------------------

export async function searchNotes(input: SearchInput): Promise<Record<string, unknown>> {
  const root = getNotesDir();
  const directory = input.directory ?? "";
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const query = input.query;

  const scope = path.resolve(path.join(root, directory));
  const scopeRel = path.relative(root, scope);
  if (scopeRel.startsWith("..") || path.isAbsolute(scopeRel)) {
    return { error: "Invalid directory scope", matches: [], total: 0 };
  }
  if (!existsSync(scope)) {
    return { error: `Directory not found: ${directory}`, matches: [], total: 0 };
  }

  const qLower = query.toLowerCase();
  const matches: { path: string; context: { line: number; text: string }[] }[] = [];

  async function walk(dirPath: string) {
    const entries = await safeReaddir(dirPath);
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      const full = path.join(dirPath, entry);
      const st = await stat(full).catch(() => null);
      if (st?.isDirectory()) {
        await walk(full);
      } else if (st?.isFile()) {
        if (await isBinaryFile(full)) continue;
        const text = await safeReadFile(full);
        if (!text) continue;
        if (!text.toLowerCase().includes(qLower)) continue;

        const rel = path.relative(root, full);
        const lines = text.split("\n");
        const contextLines: { line: number; text: string }[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(qLower)) {
            contextLines.push({ line: i + 1, text: lines[i].trim() });
            if (contextLines.length >= 5) break;
          }
        }
        matches.push({ path: rel, context: contextLines });
        if (matches.length >= limit) return;
      }
    }
  }

  await walk(scope);
  return { matches, total: matches.length, query };
}

// ---------------------------------------------------------------------------
// Tool: notes_list_tags
// ---------------------------------------------------------------------------

export async function listTags(): Promise<Record<string, unknown>> {
  const tags = await collectAllTags();
  return { tags, count: tags.length };
}

// ---------------------------------------------------------------------------
// Tool: notes_get_notes_by_tag
// ---------------------------------------------------------------------------

export async function getNotesByTag(input: TagInput): Promise<Record<string, unknown>> {
  const root = getNotesDir();
  const results: { name: string; path: string; frontmatter: Record<string, unknown> }[] = [];
  const targetTag = input.tag;

  async function walk(dirPath: string) {
    const entries = await safeReaddir(dirPath);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry.toLowerCase() === "readme.md") continue;
      const full = path.join(dirPath, entry);
      const st = await stat(full).catch(() => null);
      if (st?.isDirectory()) {
        await walk(full);
      } else if (st?.isFile() && path.extname(entry).toLowerCase() === ".md") {
        const source = await safeReadFile(full);
        if (!source) continue;
        const { meta } = extractFrontmatter(source);
        const fileTags = meta.tags;
        const tags: string[] = [];
        if (typeof fileTags === "string") {
          tags.push(fileTags);
        } else if (Array.isArray(fileTags)) {
          for (const t of fileTags) {
            if (typeof t === "string") tags.push(t);
          }
        }
        if (tags.includes(targetTag)) {
          const rel = path.relative(root, full);
          results.push({
            name: path.basename(entry, ".md").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            path: rel,
            frontmatter: meta,
          });
        }
      }
    }
  }

  await walk(root);
  return { tag: targetTag, notes: results, count: results.length };
}

// ---------------------------------------------------------------------------
// Tool: notes_list_directory_tree
// ---------------------------------------------------------------------------

export async function listDirectoryTree(input: PathInput): Promise<Record<string, unknown>> {
  const root = getNotesDir();
  const startPath = input.path ?? "";
  const maxDepth = 3;

  const scope = path.resolve(path.join(root, startPath));
  const scopeRel = path.relative(root, scope);
  if (scopeRel.startsWith("..") || path.isAbsolute(scopeRel)) {
    return { error: "Invalid path", tree: [] };
  }
  if (!existsSync(scope)) {
    return { error: `Path not found: ${startPath}`, tree: [] };
  }

  interface TreeItem {
    name: string;
    path: string;
    type: "directory" | "file";
    children?: TreeItem[];
  }

  function walk(dirPath: string, depth: number): TreeItem[] {
    if (depth > maxDepth) return [];
    const items: TreeItem[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      return items;
    }
    for (const child of entries.sort()) {
      if (child.startsWith(".")) continue;
      const full = path.join(dirPath, child);
      const st = safeStatSync(full);
      if (!st) continue;
      const rel = path.relative(root, full).replace(/\\/g, "/");
      if (st.isDirectory()) {
        items.push({
          name: child,
          path: rel + "/",
          type: "directory",
          children: walk(full, depth + 1),
        });
      } else {
        items.push({ name: child, path: rel, type: "file" });
      }
    }
    return items;
  }

  return { tree: walk(scope, 0) };
}

// ---------------------------------------------------------------------------
// Tool: notes_get_backlinks
// ---------------------------------------------------------------------------

export async function getBacklinksForNote(input: PathInput): Promise<Record<string, unknown>> {
  const relPath = input.path;
  try {
    const links = await getBacklinks(relPath);
    return { path: relPath, backlinks: links };
  } catch (exc) {
    return { error: `Failed to get backlinks: ${exc}` };
  }
}

// ---------------------------------------------------------------------------
// Tool: notes_list_challenges
// ---------------------------------------------------------------------------

export async function listChallenges(input: ListChallengesInput): Promise<Record<string, unknown>> {
  const category = input.category ?? "";
  const platform = input.platform ?? "";
  const tag = input.tag ?? "";
  const solvedOnly = input.solved_only ?? false;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);

  try {
    const challenges = await prisma.challenge.findMany({
      include: { tags: true, solveScripts: true },
    });

    const results: Record<string, unknown>[] = [];
    for (const c of challenges) {
      const tags = c.tags.map((t) => t.name);
      if (category && c.category !== category) continue;
      if (platform && c.platform !== platform) continue;
      if (tag && !tags.includes(tag)) continue;
      if (solvedOnly && (!c.solveScripts || c.solveScripts.length === 0)) continue;

      results.push({
        name: c.name,
        platform: c.platform,
        category: c.category,
        tldr: c.tldr,
        readme_path: c.readmePath,
        group_path: c.groupPath,
        url: c.url,
        tags,
        solved: (c.solveScripts?.length ?? 0) > 0,
        solve_scripts: c.solveScripts?.map((s) => ({
          name: s.name,
          url: s.url,
          language: s.language,
        })) ?? [],
      });
    }

    const total = results.length;
    const sliced = results.slice(offset, offset + limit);
    return { challenges: sliced, total, offset, limit };
  } catch (exc) {
    return { error: `Failed to query challenges: ${exc}`, challenges: [], total: 0 };
  }
}

// ---------------------------------------------------------------------------
// Tool: notes_get_challenge
// ---------------------------------------------------------------------------

export async function getChallenge(input: GetChallengeInput): Promise<Record<string, unknown>> {
  try {
    const challenges = await prisma.challenge.findMany({
      include: { tags: true, solveScripts: true },
    });
    for (const c of challenges) {
      if (c.name === input.name_or_path || c.readmePath === input.name_or_path) {
        return {
          name: c.name,
          platform: c.platform,
          category: c.category,
          tldr: c.tldr,
          readme_path: c.readmePath,
          group_path: c.groupPath,
          url: c.url,
          platform_url: c.platformUrl,
          tags: c.tags.map((t) => t.name),
          solved: (c.solveScripts?.length ?? 0) > 0,
          solve_scripts: c.solveScripts?.map((s) => ({
            name: s.name,
            url: s.url,
            language: s.language,
          })) ?? [],
        };
      }
    }
    return { error: `Challenge not found: ${input.name_or_path}` };
  } catch (exc) {
    return { error: `Failed to get challenge: ${exc}` };
  }
}

// ---------------------------------------------------------------------------
// Tool: notes_extract_frontmatter
// ---------------------------------------------------------------------------

export async function getFrontmatter(input: GetFrontmatterInput): Promise<Record<string, unknown>> {
  let filePath: string;
  try {
    filePath = validatePath(input.path);
  } catch (exc) {
    return { error: String(exc) };
  }
  if (!existsSync(filePath)) {
    return { error: `File not found: ${input.path}` };
  }

  try {
    const raw = await readFile(filePath, "utf-8");
    const { meta, body } = extractFrontmatter(raw);
    return {
      path: input.path,
      frontmatter: meta,
      body_preview: body.slice(0, 1000) + (body.length > 1000 ? "..." : ""),
    };
  } catch (exc) {
    return { error: `Failed to read ${input.path}: ${exc}` };
  }
}

// ---------------------------------------------------------------------------
// Tool: notes_render_markdown
// ---------------------------------------------------------------------------

export async function renderMarkdown(input: RenderMarkdownInput): Promise<Record<string, unknown>> {
  try {
    const html = await renderMarkdownToHtml(input.content);
    return { html };
  } catch (exc) {
    return { error: `Render failed: ${exc}` };
  }
}

// ---------------------------------------------------------------------------
// Tool: notes_find_related_notes
// ---------------------------------------------------------------------------

export async function findRelatedNotes(input: PathInput): Promise<Record<string, unknown>> {
  const root = getNotesDir();
  const targetPath = input.path;

  // Get target note metadata
  let targetMeta: Record<string, unknown>;
  try {
    const targetFile = validatePath(targetPath);
    const raw = await readFile(targetFile, "utf-8");
    targetMeta = extractFrontmatter(raw).meta;
  } catch (exc) {
    return { error: `Failed to read target note: ${exc}` };
  }

  const rawTags = targetMeta.tags;
  const targetTags = new Set<string>();
  if (typeof rawTags === "string") {
    targetTags.add(rawTags);
  } else if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (typeof t === "string") targetTags.add(t);
    }
  }

  const related: {
    path: string;
    name: string;
    shared_tags: string[];
    same_directory: boolean;
  }[] = [];

  async function walk(dirPath: string) {
    const entries = await safeReaddir(dirPath);
    for (const entry of entries) {
      if (entry.startsWith("_")) continue;
      const full = path.join(dirPath, entry);
      const st = await stat(full).catch(() => null);
      if (st?.isDirectory()) {
        await walk(full);
      } else if (st?.isFile() && path.extname(entry).toLowerCase() === ".md") {
        const rel = path.relative(root, full);
        if (rel === targetPath) continue;
        const source = await safeReadFile(full);
        if (!source) continue;
        const { meta } = extractFrontmatter(source);
        const fileTags: string[] = [];
        const ft = meta.tags;
        if (typeof ft === "string") {
          fileTags.push(ft);
        } else if (Array.isArray(ft)) {
          for (const t of ft) {
            if (typeof t === "string") fileTags.push(t);
          }
        }
        const sharedTags = fileTags.filter((t) => targetTags.has(t));
        const sameDir = path.dirname(rel) === path.dirname(targetPath);
        if (sharedTags.length > 0 || sameDir) {
          const name = path.basename(entry, ".md")
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          related.push({
            path: rel,
            name,
            shared_tags: sharedTags,
            same_directory: sameDir,
          });
        }
      }
    }
  }

  await walk(root);
  related.sort((a, b) => b.shared_tags.length - a.shared_tags.length);
  return { target: targetPath, related: related.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function renderMarkdownToHtml(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSanitize)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);
  return String(result);
}

async function collectAllTags(): Promise<string[]> {
  const root = getNotesDir();
  const tags = new Set<string>();

  async function walk(dirPath: string) {
    const entries = await safeReaddir(dirPath);
    for (const entry of entries) {
      if (entry.startsWith("_")) continue;
      const full = path.join(dirPath, entry);
      const st = await stat(full).catch(() => null);
      if (st?.isDirectory()) {
        await walk(full);
      } else if (st?.isFile() && path.extname(entry).toLowerCase() === ".md") {
        const source = await safeReadFile(full);
        if (!source) continue;
        const { meta } = extractFrontmatter(source);
        const fileTags = meta.tags;
        if (typeof fileTags === "string") {
          tags.add(fileTags);
        } else if (Array.isArray(fileTags)) {
          for (const t of fileTags) {
            if (typeof t === "string") tags.add(t);
          }
        }
      }
    }
  }

  await walk(root);

  // Tags from challenges DB
  try {
    const dbTags = await prisma.tag.findMany({ select: { name: true } });
    for (const t of dbTags) {
      tags.add(t.name);
    }
  } catch {
    // Ignore DB errors gracefully
  }

  return Array.from(tags).sort();
}
