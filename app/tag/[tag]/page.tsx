/**
 * Tag detail page — shows all notes, challenges, and vulnerabilities
 * that share a given tag.
 *
 * Port of the original Python `/tag/{tag}` route.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { NoteLayout } from "@/app/components/note-layout";
import { buildNoteTree, findNotesByTag } from "@/app/lib/file-resolver";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    tag: string;
  }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { tag } = await params;
  return { title: `Tag: ${decodeURIComponent(tag)}` };
}

async function getTaggedChallenges(tag: string) {
  try {
    return await prisma.challenge.findMany({
      where: { tags: { some: { name: tag } } },
      orderBy: { name: "asc" },
      include: { tags: true },
    });
  } catch {
    return [];
  }
}

async function getTaggedVulnerabilities(tag: string) {
  try {
    return await prisma.vulnerability.findMany({
      where: { tags: { some: { name: tag } } },
      orderBy: { name: "asc" },
      include: { tags: true },
    });
  } catch {
    return [];
  }
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const decoded = decodeURIComponent(tag);
  const tree = buildNoteTree("");

  const [noteMatches, challengeMatches, vulnMatches] = await Promise.all([
    findNotesByTag(decoded),
    getTaggedChallenges(decoded),
    getTaggedVulnerabilities(decoded),
  ]);

  const hasAny = noteMatches.length > 0 || challengeMatches.length > 0 || vulnMatches.length > 0;
  if (!hasAny) {
    notFound();
  }

  return (
    <NoteLayout entries={tree}>
      <article className="prose prose-slate max-w-none">
        <h1>#{decoded}</h1>

        {noteMatches.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold mb-3">Notes</h2>
            <ul className="space-y-1">
              {noteMatches.map((n) => (
                <li key={n.path}>
                  <a href={`/${n.path}`} className="text-primary hover:underline">
                    {n.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {challengeMatches.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold mb-3">Challenges</h2>
            <ul className="space-y-1">
              {challengeMatches.map((ch) => (
                <li key={ch.id}>
                  <a href={`/${ch.readmePath}`} className="text-primary hover:underline">
                    {ch.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {vulnMatches.length > 0 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold mb-3">Vulnerabilities</h2>
            <ul className="space-y-1">
              {vulnMatches.map((v) => (
                <li key={v.id}>
                  <a href={`/${v.readmePath}`} className="text-primary hover:underline">
                    {v.name}
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
