/**
 * Catch-all dynamic route for notes, directories, images, and raw files.
 *
 * Mirrors the original Python `server.py` `/{rel_path:path}` route.
 * - Markdown files → rendered note page
 * - Directories → directory index with README + children
 * - Images → served directly
 * - Text files → rendered as code block
 * - Binary files → unsupported message
 *
 * @module note-page
 */

import path from "node:path";
import { notFound } from "next/navigation";
import { existsSync, statSync, readdirSync, lstatSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Metadata } from "next";

import {
  resolveNotePath,
  TraverseError,
  buildNoteTree,
} from "@/app/lib/file-resolver";
import {
  isBinaryFile,
  isTextFile,
  getLanguageForFile,
} from "@/app/lib/file-utils";
import { renderNotePage } from "@/app/lib/render-markdown";
import { MarkdownRenderer } from "@/app/components/markdown-renderer";
import { NoteLayout } from "@/app/components/note-layout";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    slug?: string[];
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const note = await renderNotePage(slug?.join("/") ?? "");
    return { title: note.title };
  } catch {
    return { title: "Markdown Render" };
  }
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug } = await params;
  const relPath = slug?.join("/") ?? "";

  let filePath: string;
  try {
    filePath = await resolveNotePath(relPath);
  } catch (err) {
    if (err instanceof TraverseError && err.statusCode === 404) {
      notFound();
    }
    throw err;
  }

  if (!existsSync(filePath)) {
    notFound();
  }

  const st = statSync(filePath);

  const tree = buildNoteTree(relPath);

  // ── Directory ──────────────────────────────────────────────────────────
  if (st.isDirectory()) {
    return <DirectoryPage dirPath={filePath} relPath={relPath} tree={tree} />;
  }

  // ── Markdown file ──────────────────────────────────────────────────────
  if (path.extname(filePath).toLowerCase() === ".md") {
    try {
      const note = await renderNotePage(relPath);
      return (
        <NoteLayout entries={tree}>
          <article className="prose prose-slate max-w-none">
            <h1>{note.title}</h1>
            <MetaBar meta={note.meta} date={note.date} />
            <MarkdownRenderer
              source={note.body}
              chessConfig={note.chessConfig}
              docPath={filePath}
            />
            {note.backlinks.length > 0 && <BacklinksSection links={note.backlinks} />}
          </article>
        </NoteLayout>
      );
    } catch {
      notFound();
    }
  }

  // ── Image file ─────────────────────────────────────────────────────────
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]);
  if (imageExts.has(path.extname(filePath).toLowerCase())) {
    const buffer = await readFile(filePath);
    const contentType = guessImageContentType(filePath);
    return new Response(buffer, {
      headers: { "Content-Type": contentType },
    }) as unknown as React.ReactElement; // Next.js allows Response from page component
  }

  // ── Binary file ────────────────────────────────────────────────────────
  if (await isBinaryFile(filePath)) {
    return (
      <NoteLayout entries={tree}>
        <div className="p-4">
          <h1 className="text-xl font-semibold mb-2">{path.basename(filePath)}</h1>
          <p className="text-muted-foreground">
            This file is binary and cannot be displayed in the browser.
          </p>
        </div>
      </NoteLayout>
    );
  }

  // ── Text file (non-markdown) ───────────────────────────────────────────
  if (await isTextFile(filePath)) {
    const content = await readFile(filePath, "utf-8");
    const language = getLanguageForFile(filePath);
    return (
      <NoteLayout entries={tree}>
        <div className="p-4">
          <h1 className="text-xl font-semibold mb-4">{path.basename(filePath)}</h1>
          <div className="code-block-wrapper">
            <div className="code-header">
              <span className="code-language">{language}</span>
            </div>
            <pre>
              <code>{content}</code>
            </pre>
          </div>
        </div>
      </NoteLayout>
    );
  }

  // Fallback unsupported
  return (
    <NoteLayout entries={tree}>
      <div className="p-4">
        <h1 className="text-xl font-semibold mb-2">{path.basename(filePath)}</h1>
        <p className="text-muted-foreground">Unsupported file type.</p>
      </div>
    </NoteLayout>
  );
}

// ---------------------------------------------------------------------------
// Directory page
// ---------------------------------------------------------------------------

async function DirectoryPage({ dirPath, relPath, tree }: { dirPath: string; relPath: string; tree: ReturnType<typeof buildNoteTree> }) {
  const root = path.resolve((await import("@/app/lib/config")).notesDir());
  const readmePath = path.join(dirPath, "README.md");
  const hasReadme = existsSync(readmePath);

  let readmeHtml: string | null = null;
  let readmeMeta: Record<string, unknown> = {};
  let pageTitle = path.basename(dirPath);

  if (hasReadme) {
    try {
      const note = await renderNotePage(path.relative(root, readmePath));
      readmeHtml = note.body;
      readmeMeta = note.meta;
      pageTitle = note.title;
    } catch {
      /* ignore */
    }
  }

  // Build children list
  const entries: { name: string; url: string; isDir: boolean }[] = [];
  for (const child of readdirSync(dirPath).sort()) {
    if (child.startsWith(".")) continue;
    if (child === "README.md") continue;
    const childFull = path.join(dirPath, child);
    const childRel = path.relative(root, childFull).replace(/\\/g, "/");
    const childSt = lstatSync(childFull);
    if (childSt.isSymbolicLink()) continue;
    if (childSt.isDirectory()) {
      entries.push({ name: child + "/", url: `/${childRel}/`, isDir: true });
    } else {
      entries.push({ name: child, url: `/${childRel}`, isDir: false });
    }
  }

  return (
    <NoteLayout entries={tree}>
      <article className="prose prose-slate max-w-none">
        <h1>{pageTitle}</h1>
        {readmeHtml && (
          <>
            <MetaBar meta={readmeMeta} date={undefined} />
            <MarkdownRenderer
              source={readmeHtml}
            />
          </>
        )}
        {entries.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Contents</h2>
            <ul className="space-y-1">
              {entries.map((e) => (
                <li key={e.url}>
                  <a
                    href={e.url}
                    className="text-primary hover:underline flex items-center gap-2"
                  >
                    {e.isDir ? (
                      <span className="text-muted-foreground">📁</span>
                    ) : (
                      <span className="text-muted-foreground">📄</span>
                    )}
                    {e.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </NoteLayout>
  );
}

// ---------------------------------------------------------------------------
// Layout wrapper with sidebar
// ---------------------------------------------------------------------------

// Re-export the layout from its own file so we can keep this page server-only
// but the layout will be imported here.

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaBar({
  meta,
  date,
}: {
  meta: Record<string, unknown>;
  date: string | undefined;
}) {
  const tags = meta.tags;
  const tagList: string[] = [];
  if (typeof tags === "string") {
    tagList.push(tags);
  } else if (Array.isArray(tags)) {
    for (const t of tags) {
      if (typeof t === "string") tagList.push(t);
    }
  }

  const otherMeta = Object.entries(meta).filter(
    ([key]) => key !== "tags" && key !== "date",
  );

  return (
    <div className="meta-bar">
      {date && (
        <>
          <span className="date-badge">{date}</span>
          <span className="meta-sep">·</span>
        </>
      )}
      {otherMeta.map(([key, value]) => (
        <span key={key} className="meta-field">
          <span className="meta-key">{key}:</span>
          {String(value)}
        </span>
      ))}
      {tagList.map((t) => (
        <a key={t} href={`/tag/${encodeURIComponent(t)}`} className="tag-chip">
          {t}
        </a>
      ))}
    </div>
  );
}

function BacklinksSection({
  links,
}: {
  links: Awaited<ReturnType<typeof import("@/app/lib/backlinks").getBacklinks>>;
}) {
  return (
    <section className="mt-12 border-t pt-6">
      <h2 className="text-lg font-semibold mb-3">Backlinks</h2>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.path}>
            <a href={`/${l.path}`} className="text-primary hover:underline">
              {l.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessImageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
  };
  return map[ext] ?? "application/octet-stream";
}
