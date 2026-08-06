/**
 * Vulnerabilities index page — lists all vulnerabilities from the Prisma database.
 *
 * Port of the original Python `/vulnerabilities` route.
 */

import { prisma } from "@/app/lib/prisma";
import { NoteLayout } from "@/app/components/note-layout";
import { buildNoteTree } from "@/app/lib/file-resolver";
import { Badge } from "@/app/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vulnerabilities",
};

async function getVulnerabilities() {
  try {
    return await prisma.vulnerability.findMany({
      include: { tags: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export default async function VulnerabilitiesPage() {
  const tree = buildNoteTree("");
  const vulns = await getVulnerabilities();

  return (
    <NoteLayout entries={tree}>
      <article className="prose prose-slate max-w-none">
        <h1>Vulnerabilities</h1>
        {vulns.length === 0 ? (
          <p className="text-muted-foreground">
            No vulnerabilities found. Run the sync script to populate the database.
          </p>
        ) : (
          <ul className="space-y-4 mt-6">
            {vulns.map((v) => (
              <li
                key={v.id}
                className="border border-border rounded-lg p-4 bg-card hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/${v.readmePath}`}
                      className="text-lg font-semibold text-primary hover:underline"
                    >
                      {v.name}
                    </a>
                    {v.summary ? (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {v.summary}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {v.severity ? (
                        <Badge
                          variant={
                            v.severity.toLowerCase() === "critical" ||
                            v.severity.toLowerCase() === "high"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {v.severity}
                        </Badge>
                      ) : null}
                      {v.cve ? (
                        <span className="text-xs font-mono text-muted-foreground">
                          {v.cve}
                        </span>
                      ) : null}
                      {v.tags.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-xs">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </NoteLayout>
  );
}
