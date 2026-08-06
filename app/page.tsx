/**
 * Root index page — delegates to the same directory-rendering logic.
 */

import path from "node:path";
import { existsSync, readdirSync, lstatSync } from "node:fs";

import { notesDir } from "@/app/lib/config";
import { buildNoteTree } from "@/app/lib/file-resolver";
import { NoteLayout } from "@/app/components/note-layout";
import { MarkdownRenderer } from "@/app/components/markdown-renderer";
import { renderNotePage } from "@/app/lib/render-markdown";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notes",
};

export default async function RootPage() {
  const root = path.resolve(notesDir());
  const tree = buildNoteTree("");

  if (!existsSync(root)) {
    return (
      <NoteLayout entries={tree}>
        <div className="p-4">
          <h1 className="text-xl font-semibold">Notes</h1>
          <p className="text-muted-foreground mt-2">
            Notes directory not found. Create it at <code>{root}</code>.
          </p>
        </div>
      </NoteLayout>
    );
  }

  const readmePath = path.join(root, "README.md");
  const hasReadme = existsSync(readmePath);

  let readmeHtml: string | null = null;
  let readmeMeta: Record<string, unknown> = {};

  if (hasReadme) {
    try {
      const note = await renderNotePage("README.md");
      readmeHtml = note.body;
      readmeMeta = note.meta;
    } catch {
      /* ignore */
    }
  }

  const entries = listDirectory(root, root);

  const pageTitle = readmeMeta.title
    ? String(readmeMeta.title)
    : "Notes";

  return (
    <NoteLayout entries={tree}>
      <article className="prose prose-slate max-w-none">
        <h1>{pageTitle}</h1>
        {readmeHtml && (
          <>
            <div className="meta-bar">
              {Object.entries(readmeMeta).map(([key, value]) =>
                key === "tags" || key === "date" ? null : (
                  <span key={key} className="meta-field">
                    <span className="meta-key">{key}:</span>
                    {String(value)}
                  </span>
                )
              )}
            </div>
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

function listDirectory(dirPath: string, root: string) {
  const entries: { name: string; url: string; isDir: boolean }[] = [];
  for (const child of readdirSync(dirPath).sort()) {
    if (child.startsWith(".")) continue;
    if (child === "README.md") continue;
    const childFull = path.join(dirPath, child);
    const childRel = path.relative(root, childFull).replace(/\\/g, "/");
    const st = lstatSync(childFull);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      entries.push({ name: child + "/", url: `/${childRel}/`, isDir: true });
    } else {
      entries.push({ name: child, url: `/${childRel}`, isDir: false });
    }
  }
  return entries;
}
