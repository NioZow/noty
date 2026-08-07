/**
 * Challenges index page — lists all challenges from the Prisma database.
 *
 * Port of the original Python `/challenges` route.
 */

import { prisma } from "@/app/lib/prisma";
import { NoteLayout } from "@/app/components/note-layout";
import { buildNoteTree } from "@/app/lib/file-resolver";
import { Badge } from "@/app/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Challenges",
};

async function getChallenges() {
  try {
    return await prisma.challenge.findMany({
      include: { tags: true, solveScripts: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export default async function ChallengesPage() {
  const tree = buildNoteTree("");
  const challenges = await getChallenges();

  return (
    <NoteLayout entries={tree}>
      <article className="prose">
        <h1>Challenges</h1>
        {challenges.length === 0 ? (
          <p className="text-muted-foreground">
            No challenges found. Run the sync script to populate the database.
          </p>
        ) : (
          <ul className="space-y-4 mt-6">
            {challenges.map((ch) => (
              <li
                key={ch.id}
                className="border border-border rounded-lg p-4 bg-card hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <a
                      href={`/${ch.readmePath}`}
                      className="text-lg font-semibold text-primary hover:underline"
                    >
                      {ch.name}
                    </a>
                    {ch.tldr ? (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {ch.tldr}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ch.tags.map((t) => (
                        <Badge key={t.id} variant="secondary" className="text-xs">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {ch.solveScripts.length > 0 && (
                    <div className="shrink-0 text-right">
                      <span className="text-xs text-muted-foreground font-mono">
                        {ch.solveScripts.length} script
                        {ch.solveScripts.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </NoteLayout>
  );
}
