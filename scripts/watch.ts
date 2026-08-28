#!/usr/bin/env bun
/**
 * Bun-based file watcher that monitors the notes directory and broadcasts
 * "reload" events to all connected browser clients.
 *
 * Instead of using fs.watch (which can silently fail or crash on broken
 * symlinks when run in the background), we poll file mtimes every 2 seconds.
 *
 * Usage:
 *   bun run scripts/watch.ts          # Watches the configured notes_dir
 *   bun run scripts/watch.ts /path    # Override directory to watch
 */

import { statSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { load as loadYaml } from "js-yaml";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config loader (lightweight inline version to avoid full config.ts deps)
// ---------------------------------------------------------------------------

function loadConfig(): { notes_dir: string } {
  const configPath = path.join(os.homedir(), ".config", "noty", "config.yml");
  const defaults = { notes_dir: path.join(os.homedir(), "notes") };

  if (!existsSync(configPath)) return defaults;

  try {
    const text = readFileSync(configPath, "utf-8");
    const parsed = loadYaml(text) as Record<string, unknown> | null;
    if (parsed && typeof parsed.notes_dir === "string") {
      defaults.notes_dir = parsed.notes_dir;
    }
  } catch {
    // ignore malformed yaml
  }

  return defaults;
}

function expandUser(inputPath: string): string {
  if (inputPath === "~") return os.homedir();
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

// ---------------------------------------------------------------------------
// Ignore list
// ---------------------------------------------------------------------------

const IGNORED_DIRS = new Set([
  ".git",
  ".direnv",
  "node_modules",
  ".next",
  "dist",
  "out",
  ".Trash-1000",
]);

function shouldIgnore(filePath: string): boolean {
  const parts = filePath.split(path.sep);
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) return true;
    if (part.startsWith(".") && part !== ".") return true;
    if (part.endsWith("~") || part.endsWith(".tmp") || part.endsWith(".swp"))
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------

function scanDir(dir: string, result = new Map<string, number>()): Map<string, number> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (shouldIgnore(full)) continue;

    if (entry.isDirectory()) {
      try {
        scanDir(full, result);
      } catch {
        // permission denied or broken symlink — skip
      }
    } else if (entry.isFile()) {
      try {
        const s = statSync(full);
        result.set(full, s.mtimeMs);
      } catch {
        // skip files we can't stat
      }
    }
  }
  return result;
}

function snapshotString(snap: Map<string, number>): string {
  const entries = [...snap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

// ---------------------------------------------------------------------------
// Reload logic
// ---------------------------------------------------------------------------

async function broadcastReload() {
  try {
    const { bumpReloadToken } = await import(
      new URL("../app/lib/reload-emitter.ts", import.meta.url).pathname
    );
    bumpReloadToken();
    console.log(`[watch] reload triggered`);
  } catch (err) {
    console.error("[watch] Failed to broadcast reload:", err);
  }
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

const targetDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(expandUser(loadConfig().notes_dir));

if (!existsSync(targetDir)) {
  console.error(`[watch] Directory not found: ${targetDir}`);
  process.exit(1);
}

console.log(`[watch] Polling: ${targetDir} (every 2000ms)`);
console.log(`[watch] Press Ctrl+C to stop.\n`);

let lastSnapshot = snapshotString(scanDir(targetDir));

const INTERVAL_MS = 2000;

const timer = setInterval(() => {
  try {
    const current = snapshotString(scanDir(targetDir));
    if (current !== lastSnapshot) {
      lastSnapshot = current;
      broadcastReload().catch(() => {});
    }
  } catch (err) {
    console.error("[watch] Scan error:", err);
  }
}, INTERVAL_MS);

// Catch unhandled watcher errors that Bun may emit as uncaught exceptions.
process.on("uncaughtException", (err: Error) => {
  // @ts-expect-error Node error objects commonly carry a .code field
  const code = err["code"] as string | undefined;
  if (code === "ENOENT") {
    return;
  }
  console.error("[watch] Uncaught exception:", err);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[watch] Stopping watcher…");
  clearInterval(timer);
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
