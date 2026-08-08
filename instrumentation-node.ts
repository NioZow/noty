/**
 * Node-only half of the startup hook. Kept out of `instrumentation.ts` so
 * Turbopack never bundles `node:child_process`/`node:path` for the Edge
 * runtime — this module is only ever reached via a dynamic `import()`
 * gated on `NEXT_RUNTIME === "nodejs"`.
 *
 * @module instrumentation-node
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { getLogger } from "@/app/lib/logger";

export async function runStartupSync(): Promise<void> {
  const log = getLogger("startup");

  try {
    execFileSync(
      path.join(process.cwd(), "node_modules", ".bin", "prisma"),
      ["migrate", "deploy"],
      { cwd: process.cwd(), stdio: "inherit" },
    );
  } catch (exc) {
    log.error(`Failed to apply database migrations: ${exc}`);
    return;
  }

  const { notesDir, challengesRoot } = await import("@/app/lib/config");
  const { rebuildChallengesDb } = await import("@/app/lib/sync/challenges");
  const { rebuildVulnerabilitiesDb } = await import(
    "@/app/lib/sync/vulnerabilities"
  );

  try {
    await rebuildChallengesDb(notesDir(), challengesRoot() ?? undefined);
  } catch (exc) {
    log.error(`Failed to populate challenges database: ${exc}`);
  }

  try {
    await rebuildVulnerabilitiesDb(notesDir());
  } catch (exc) {
    log.error(`Failed to populate vulnerabilities database: ${exc}`);
  }
}
