/**
 * Vulnerability discovery and database sync.
 *
 * Ported from src/renderer/vulnerability_parser.py and src/renderer/vulnerability_sync.py
 */

import { promises as fs, Dirent } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { prisma } from "@/app/lib/prisma";
import { getLogger } from "@/app/lib/logger";
import { readTextFile } from "@/app/lib/file-utils";

const log = getLogger("vuln-sync");

export interface VulnerabilityData {
  name: string;
  severity: string;
  cve: string;
  complexity: string;
  summary: string;
  tags: string[];
  chainWith: string[];
  readmePath: string;
  groupPath: string;
}

function cleanCell(text: string): string {
  return text
    .trim()
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function extractFirstH1(body: string): string | null {
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) {
      return line.slice(2).trim();
    }
  }
  return null;
}

function extractSummary(body: string, meta: Record<string, unknown>): string {
  const summary = String(meta.summary || "");
  if (summary) return cleanCell(summary);

  const lines = body.split("\n");
  let inHeading = false;
  let collecting = false;
  const buffer: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith("#")) {
      inHeading = true;
      collecting = false;
      continue;
    }
    if (inHeading && !stripped) continue;
    if (inHeading && stripped) {
      inHeading = false;
      collecting = true;
    }
    if (collecting) {
      if (!stripped) break;
      buffer.push(stripped);
    }
  }

  if (buffer.length) return cleanCell(buffer.join(" "));
  return "";
}

function coerceString(val: unknown): string {
  if (Array.isArray(val)) return val.map(String).join(", ");
  if (typeof val === "object" && val !== null)
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  return val !== undefined && val !== null ? String(val) : "";
}

function dirNameToTitle(dirName: string): string {
  return dirName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function parseVulnerabilityReadme(
  readmePath: string,
  notesPath: string,
  vulnRoot: string,
): Promise<VulnerabilityData | null> {
  const vulnDir = path.dirname(readmePath);
  const relReadme = path.relative(notesPath, readmePath);

  let relFromRoot: string;
  try {
    relFromRoot = path.relative(vulnRoot, vulnDir);
  } catch {
    return null;
  }

  const parts = relFromRoot.split(path.sep).filter(Boolean);

  const vulnIdx = parts.findIndex(
    (p) => p.toLowerCase() === "vulnerabilities",
  );
  if (vulnIdx === -1) return null;
  if (path.basename(vulnDir).toLowerCase() === "vulnerabilities") return null;

  const groupParts = [
    ...parts.slice(0, vulnIdx),
    ...parts.slice(vulnIdx + 1, -1),
  ];
  const groupPath = groupParts.join("/");

  const source = await readTextFile(readmePath);
  const { data: meta, content: body } = matter(source);

  let name = String(meta.title || "");
  if (!name) {
    name = extractFirstH1(body) || "";
  }
  if (!name) {
    name = dirNameToTitle(path.basename(vulnDir));
  }

  const severity = coerceString(meta.severity);
  const cve = coerceString(meta.cve);
  const complexity = coerceString(meta.complexity);
  const summary = extractSummary(body, meta);

  const rawTags = meta.tags;
  let tags: string[] = [];
  if (typeof rawTags === "string") {
    tags = [rawTags];
  } else if (Array.isArray(rawTags)) {
    tags = rawTags.map(String);
  }

  const rawChain = meta["chain-with"];
  let chainWith: string[] = [];
  if (typeof rawChain === "string") {
    chainWith = [rawChain];
  } else if (Array.isArray(rawChain)) {
    chainWith = rawChain.map(String);
  }

  return {
    name,
    severity,
    cve,
    complexity,
    summary,
    tags,
    chainWith,
    readmePath: relReadme.replace(/\\/g, "/"),
    groupPath,
  };
}

export async function discoverVulnerabilities(
  notesPath: string,
  vulnRoot?: string,
): Promise<VulnerabilityData[]> {
  const root = vulnRoot || notesPath;

  try {
    await fs.access(root);
  } catch {
    return [];
  }

  const all: VulnerabilityData[] = [];

  async function walk(dir: string) {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.toLowerCase() === "readme.md") {
        const vulnDir = path.dirname(full);
        let relFromRoot: string;
        try {
          relFromRoot = path.relative(root, vulnDir);
        } catch {
          continue;
        }
        const parts = relFromRoot.split(path.sep).filter(Boolean);
        const hasVuln = parts.some(
          (p) => p.toLowerCase() === "vulnerabilities",
        );
        if (!hasVuln) continue;
        if (path.basename(vulnDir).toLowerCase() === "vulnerabilities")
          continue;

        const v = await parseVulnerabilityReadme(full, notesPath, root);
        if (v) all.push(v);
      }
    }
  }

  await walk(root);
  return all;
}

export function getVulnerabilityTags(vuln: VulnerabilityData): string[] {
  const tags: string[] = [];
  if (vuln.severity) {
    tags.push(vuln.severity.toLowerCase().replace(/[\s_]+/g, "-"));
  }
  for (const t of vuln.tags) {
    const norm = t.toLowerCase().replace(/[\s_]+/g, "-");
    if (!tags.includes(norm)) tags.push(norm);
  }
  for (const part of vuln.groupPath.split("/")) {
    const p = part.toLowerCase();
    if (p && p !== "vulnerabilities") tags.push(p);
  }
  return [...new Set(tags)];
}

export async function rebuildVulnerabilitiesDb(
  notesPath: string,
  vulnRoot?: string,
): Promise<void> {
  log.info(`Notes directory:         ${notesPath}`);
  log.info(`Vulnerabilities root:    ${vulnRoot || notesPath}`);

  log.info("Wiping existing vulnerability data...");
  await prisma.$transaction([
    prisma.vulnerability.deleteMany(),
    prisma.vulnTag.deleteMany(),
  ]);
  log.success("Existing vulnerability data cleared.");

  log.info("Scanning for vulnerability directories...");
  const vulns = await discoverVulnerabilities(notesPath, vulnRoot);
  log.success(`Discovered ${vulns.length} vulnerability(ies).`);

  if (vulns.length === 0) {
    log.warning("No vulnerabilities found — database is empty.");
    return;
  }

  log.info("Writing vulnerabilities to database...");
  let totalTags = 0;

  const tagMap = new Map<string, number>();

  for (const vuln of vulns) {
    const dbVuln = await prisma.vulnerability.create({
      data: {
        name: vuln.name,
        severity: vuln.severity,
        cve: vuln.cve,
        complexity: vuln.complexity,
        summary: vuln.summary,
        readmePath: vuln.readmePath,
        groupPath: vuln.groupPath,
      },
    });

    const tagNames = getVulnerabilityTags(vuln);
    for (const tagName of tagNames) {
      let tagId = tagMap.get(tagName);
      if (tagId === undefined) {
        const existing = await prisma.vulnTag.findUnique({
          where: { name: tagName },
        });
        if (existing) {
          tagId = existing.id;
        } else {
          const created = await prisma.vulnTag.create({
            data: { name: tagName },
          });
          tagId = created.id;
        }
        tagMap.set(tagName, tagId);
      }
      await prisma.vulnerability.update({
        where: { id: dbVuln.id },
        data: {
          tags: { connect: { id: tagId } },
        },
      });
      totalTags++;
    }
  }

  log.success("Vulnerability database rebuild complete.");
  log.info(`  Vulnerabilities: ${vulns.length}`);
  log.info(`  Tag links:       ${totalTags}`);
}
