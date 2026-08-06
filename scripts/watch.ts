#!/usr/bin/env bun
/**
 * Bun-based file watcher that monitors the notes directory and broadcasts
 * "reload" events to all connected browser clients via a global EventEmitter.
 *
 * Usage:
 *   bun run scripts/watch.ts          # Watches the configured notes_dir
 *   bun run scripts/watch.ts /path    # Override directory to watch
 *
 * This is an implementation of Phase 6 "Hot Reload" from the migration plan.
 */

import { watch, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { load as loadYaml } from "js-yaml";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Config loader (lightweight inline version to avoid full config.ts deps)
// ---------------------------------------------------------------------------

function loadConfig(): { notes_dir: string } {
  const configPath = path.join(os.homedir(), ".config", "markdown-render", "config.yml");
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
// Debounce helper
// ---------------------------------------------------------------------------

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number,
): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  }) as T;
}

// ---------------------------------------------------------------------------
// Watch logic
// ---------------------------------------------------------------------------

const targetDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(expandUser(loadConfig().notes_dir));

if (!existsSync(targetDir)) {
  console.error(`[watch] Directory not found: ${targetDir}`);
  process.exit(1);
}

console.log(`[watch] Monitoring: ${targetDir}`);
console.log(`[watch] Press Ctrl+C to stop.\n`);

const DEBOUNCE_MS = 250;

/**
 * Broadcast a reload by importing the shared emitter.
 *
 * We lazy-import this so the same `EventEmitter` singleton used by the
 * Next.js `/api/reload` route is reused here.
 */
async function broadcastReload(changedPath: string, eventType: string) {
  try {
    const { bumpReloadToken } = await import(
      new URL("../app/lib/reload-emitter.ts", import.meta.url).pathname
    );
    bumpReloadToken();
    console.log(`[watch] reload → ${changedPath} (${eventType})`);
  } catch (err) {
    console.error("[watch] Failed to broadcast reload:", err);
  }
}

const onChange = debounce((changedPath: string, eventType: string) => {
  // Ignore dotfiles, temp swap files, and common noise
  const base = path.basename(changedPath);
  if (base.startsWith(".")) return;
  if (base.endsWith("~") || base.endsWith(".tmp") || base.endsWith(".swp")) return;

  broadcastReload(changedPath, eventType).catch(() => {});
}, DEBOUNCE_MS);

const watcher = watch(
  targetDir,
  { recursive: true, persistent: true },
  (eventType, filename) => {
    if (!filename) return;
    const full = path.join(targetDir, filename);
    onChange(full, eventType);
  },
);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[watch] Stopping watcher…");
  watcher.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  watcher.close();
  process.exit(0);
});
