/**
 * Tags index page — lists all unique tags from notes and database.
 *
 * Port of the original Python `/tags` route.
 */

import { prisma } from "@/app/lib/prisma";
import { NoteLayout } from "@/app/components/note-layout";
import { buildNoteTree, collectAllTags } from "@/app/lib/file-resolver";
import { Badge } from "@/app/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tags",
};

async function getDbTags() {
  try {
    const [challengeTags, vulnTags] = await Promise.all([
      prisma.tag.findMany({ orderBy: { name: "asc" } }),
      prisma.vulnTag.findMany({ orderBy: { name: "asc" } }),
    ]);
    return { challengeTags, vulnTags };
  } catch {
    return { challengeTags: [], vulnTags: [] };
  }
}

export default async function TagsPage() {
  const tree = buildNoteTree("");
  const noteTags = await collectAllTags();

  const { challengeTags, vulnTags } = await getDbTags();

  const all = new Map<string, { source: Set<string> }>();
  for (const t of noteTags) {
    if (!all.has(t)) all.set(t, { source: new Set() });
    all.get(t)!.source.add("notes");
  }
  for (const t of challengeTags) {
    if (!all.has(t.name)) all.set(t.name, { source: new Set() });
    all.get(t.name)!.source.add("challenges");
  }
  for (const t of vulnTags) {
    if (!all.has(t.name)) all.set(t.name, { source: new Set() });
    all.get(t.name)!.source.add("vulnerabilities");
  }

  const sorted = Array.from(all.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <NoteLayout entries={tree}>
      <article className="prose">
        <h1>Tags</h1>
        {sorted.length === 0 ? (
          <p className="text-muted-foreground">No tags found.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-6">
            {sorted.map(([tag, info]) => (
              <a key={tag} href={`/tag/${encodeURIComponent(tag)}`}>
                <Badge variant="secondary" className="text-sm cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                  #{tag}
                </Badge>
              </a>
            ))}
          </div>
        )}
      </article>
    </NoteLayout>
  );
}
