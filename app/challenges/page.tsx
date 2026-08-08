/**
 * Challenges index page — lists all challenges from the Prisma database.
 *
 * Port of the original Python `/challenges` route.
 */

import { prisma } from "@/app/lib/prisma";
import { NoteLayout } from "@/app/components/note-layout";
import { buildNoteTree } from "@/app/lib/file-resolver";
import { ChallengeGrid } from "@/app/components/challenge-grid";

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
    <NoteLayout entries={tree} wide>
      <article className="prose">
        <h1>Challenges</h1>
      </article>
      {challenges.length === 0 ? (
        <p className="text-muted-foreground">
          No challenges found. Run the sync script to populate the database.
        </p>
      ) : (
        <ChallengeGrid challenges={challenges} />
      )}
    </NoteLayout>
  );
}
