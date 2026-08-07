#!/usr/bin/env bun
/**
 * Dev orchestrator that starts both the Next.js dev server and the file
 * watcher in parallel, so the hot-reload token is kept in sync across the
 * two processes.
 *
 * Usage:
 *   bun run dev
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

function start(cmd: string[], label: string) {
  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  proc.on("exit", (code) => {
    console.log(`[dev] ${label} exited with code ${code ?? "?"}`);
    shutdown(code ?? 1);
  });

  return proc;
}

let shuttingDown = false;
const children: ReturnType<typeof spawn>[] = [];

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  // Give processes a moment to clean up, then force kill
  setTimeout(() => process.exit(exitCode), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("[dev] Starting Next.js dev server + file watcher\n");

children.push(start(["bun", "run", "next", "dev", "--turbopack"], "next"));
children.push(start(["bun", "run", "scripts/watch.ts"], "watch"));
