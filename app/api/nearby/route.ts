/**
 * API endpoint powering the right sidebar's quick-links panel.
 *
 * Returns vulnerabilities and challenges whose README lives under the
 * requested folder or one of its sub-folders (recursive), so a reader
 * browsing a directory can immediately see what's nearby.
 *
 * @module api/nearby/route
 */

import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export interface NearbyVulnerability {
  id: number;
  name: string;
  severity: string;
  readmePath: string;
}

export interface NearbyChallenge {
  id: number;
  name: string;
  category: string;
  readmePath: string;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const folder = (searchParams.get("folder") ?? "").replace(/^\/+|\/+$/g, "");
  const prefix = folder ? `${folder}/` : "";

  try {
    const [vulnerabilities, challenges] = await Promise.all([
      prisma.vulnerability.findMany({
        where: prefix ? { readmePath: { startsWith: prefix } } : undefined,
        select: { id: true, name: true, severity: true, readmePath: true },
        orderBy: { name: "asc" },
      }),
      prisma.challenge.findMany({
        where: prefix ? { readmePath: { startsWith: prefix } } : undefined,
        select: { id: true, name: true, category: true, readmePath: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return Response.json({ vulnerabilities, challenges });
  } catch {
    return Response.json({ vulnerabilities: [], challenges: [] });
  }
}
