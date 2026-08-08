/**
 * Vulnerabilities index page — lists all vulnerabilities from the Prisma database.
 *
 * Port of the original Python `/vulnerabilities` route.
 */

import { prisma } from "@/app/lib/prisma";
import { NoteLayout } from "@/app/components/note-layout";
import { buildNoteTree } from "@/app/lib/file-resolver";
import { VulnerabilityGrid } from "@/app/components/vulnerability-grid";

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
    <NoteLayout entries={tree} wide>
      <article className="prose">
        <h1>Vulnerabilities</h1>
      </article>
      {vulns.length === 0 ? (
        <p className="text-muted-foreground">
          No vulnerabilities found. Run the sync script to populate the database.
        </p>
      ) : (
        <VulnerabilityGrid vulns={vulns} />
      )}
    </NoteLayout>
  );
}
