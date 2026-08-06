/**
 * Challenge discovery and database sync.
 *
 * Ported from src/renderer/challenge_parser.py and src/renderer/challenge_sync.py
 */

import { promises as fs, Dirent } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { prisma } from "@/app/lib/prisma";
import { getLogger } from "@/app/lib/logger";
import { readTextFile } from "@/app/lib/file-utils";

const log = getLogger("challenge-sync");

const TLDR_RE = />\s*\*\*TL;DR\*\*:\s*([\s\S]+?)(?=\n\n|\n##|$)/i;
const INFRA_STEMS = new Set(["source", "example", "params"]);

export interface ChallengeData {
  name: string;
  url: string | null;
  platform: string;
  platformUrl: string | null;
  tldr: string;
  category: string;
  solveScripts: { name: string; url: string; language: string }[];
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

async function findSolveScriptsInDir(challengeDir: string): Promise<string[]> {
  const entries = await fs.readdir(challengeDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name);

  let candidates = files.filter((f) => {
    const ext = path.extname(f);
    return ext === ".py" || ext === ".sage" || f.endsWith(".sage.py");
  });

  const solves = candidates.filter((f) => {
    let stem = path.basename(f, path.extname(f));
    if (stem.endsWith(".sage")) stem = stem.slice(0, -5);
    return stem === "solve";
  });

  if (solves.length > 0) return solves.sort();

  candidates = candidates.filter((f) => {
    let stem = path.basename(f, path.extname(f));
    if (stem.endsWith(".sage")) stem = stem.slice(0, -5);
    return !INFRA_STEMS.has(stem);
  });

  return candidates.sort();
}

function dirNameToTitle(dirName: string): string {
  return dirName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function parseChallengeReadme(
  readmePath: string,
  notesPath: string,
  challengesRoot: string,
): Promise<ChallengeData | null> {
  const challengeDir = path.dirname(readmePath);
  const relReadme = path.relative(notesPath, readmePath);

  let relFromRoot: string;
  try {
    relFromRoot = path.relative(challengesRoot, challengeDir);
  } catch {
    return null;
  }

  const parts = relFromRoot.split(path.sep).filter(Boolean);

  const challengesIdx = parts.findIndex(
    (p) => p.toLowerCase() === "challenges",
  );
  if (challengesIdx === -1) return null;
  if (path.basename(challengeDir).toLowerCase() === "challenges") return null;

  const groupParts = [
    ...parts.slice(0, challengesIdx),
    ...parts.slice(challengesIdx + 1, -1),
  ];
  const groupPath = groupParts.join("/");

  const source = await readTextFile(readmePath);
  const { data: meta, content: body } = matter(source);

  let name = (meta.title as string) || "";
  if (!name) {
    name = extractFirstH1(body) || "";
  }
  if (!name) {
    name = dirNameToTitle(path.basename(challengeDir));
  }

  const platform = String(meta.ctf || "");

  let tldr = String(meta.tldr || "");
  if (!tldr) {
    const m = TLDR_RE.exec(source);
    if (m) tldr = cleanCell(m[1]);
  }

  const url = meta.url ? String(meta.url) : null;

  const category = groupParts[0]
    ? dirNameToTitle(groupParts[0])
    : "";

  const scripts = await findSolveScriptsInDir(challengeDir);
  const solveScripts = scripts.map((s) => ({
    name: s,
    url: "/" + path.relative(notesPath, path.join(challengeDir, s)).replace(/\\/g, "/"),
    language: path.extname(s).slice(1),
  }));

  return {
    name,
    url,
    platform,
    platformUrl: null,
    tldr,
    category,
    solveScripts,
    readmePath: relReadme.replace(/\\/g, "/"),
    groupPath,
  };
}

export async function discoverChallenges(
  notesPath: string,
  challengesRoot?: string,
): Promise<ChallengeData[]> {
  const root = challengesRoot || notesPath;

  try {
    await fs.access(root);
  } catch {
    return [];
  }

  const all: ChallengeData[] = [];

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
        const challengeDir = path.dirname(full);
        let relFromRoot: string;
        try {
          relFromRoot = path.relative(root, challengeDir);
        } catch {
          continue;
        }
        const parts = relFromRoot.split(path.sep).filter(Boolean);
        const hasChallenges = parts.some(
          (p) => p.toLowerCase() === "challenges",
        );
        if (!hasChallenges) continue;
        if (path.basename(challengeDir).toLowerCase() === "challenges")
          continue;

        const ch = await parseChallengeReadme(full, notesPath, root);
        if (ch) all.push(ch);
      }
    }
  }

  await walk(root);
  return all;
}

export function getChallengeTags(challenge: ChallengeData): string[] {
  const tags: string[] = [];
  if (challenge.category) {
    tags.push(
      challenge.category.toLowerCase().replace(/[\s_]+/g, "-"),
    );
  }
  if (challenge.platform) {
    tags.push(
      challenge.platform.toLowerCase().replace(/[\s_]+/g, "-"),
    );
  }
  for (const part of challenge.groupPath.split("/")) {
    const p = part.toLowerCase();
    if (p && p !== "challenges") tags.push(p);
  }
  return [...new Set(tags)];
}

export async function rebuildChallengesDb(
  notesPath: string,
  challengesRoot?: string,
): Promise<void> {
  log.info(`Notes directory:    ${notesPath}`);
  log.info(`Challenges root:    ${challengesRoot || notesPath}`);

  log.info("Wiping existing challenge data...");
  await prisma.$transaction([
    prisma.solveScript.deleteMany(),
    prisma.challenge.deleteMany(),
    prisma.tag.deleteMany(),
  ]);
  log.success("Existing data cleared.");

  log.info("Scanning for challenge directories...");
  const challenges = await discoverChallenges(notesPath, challengesRoot);
  log.success(`Discovered ${challenges.length} challenge(s).`);

  if (challenges.length === 0) {
    log.warning("No challenges found — database is empty.");
    return;
  }

  log.info("Writing challenges to database...");
  let totalScripts = 0;
  let totalTags = 0;

  const tagMap = new Map<string, number>(); // name -> id

  for (const ch of challenges) {
    const dbChallenge = await prisma.challenge.create({
      data: {
        name: ch.name,
        url: ch.url,
        platform: ch.platform,
        platformUrl: ch.platformUrl,
        tldr: ch.tldr,
        category: ch.category,
        readmePath: ch.readmePath,
        groupPath: ch.groupPath,
      },
    });

    for (const script of ch.solveScripts) {
      await prisma.solveScript.create({
        data: {
          challengeId: dbChallenge.id,
          name: script.name,
          url: script.url,
          language: script.language,
        },
      });
      totalScripts++;
    }

    const tagNames = getChallengeTags(ch);
    for (const tagName of tagNames) {
      let tagId = tagMap.get(tagName);
      if (tagId === undefined) {
        const existing = await prisma.tag.findUnique({
          where: { name: tagName },
        });
        if (existing) {
          tagId = existing.id;
        } else {
          const created = await prisma.tag.create({
            data: { name: tagName },
          });
          tagId = created.id;
        }
        tagMap.set(tagName, tagId);
      }
      await prisma.challenge.update({
        where: { id: dbChallenge.id },
        data: {
          tags: { connect: { id: tagId } },
        },
      });
      totalTags++;
    }
  }

  log.success("Database rebuild complete.");
  log.info(`  Challenges: ${challenges.length}`);
  log.info(`  Scripts:    ${totalScripts}`);
  log.info(`  Tag links:  ${totalTags}`);
}
