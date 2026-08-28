/**
 * Global EventEmitter used to broadcast file-change "reload" events from the
 * file watcher to all connected SSE clients.
 *
 * The token is persisted to a temp file so that the standalone watcher
 * process and the Next.js dev server process share the same value.
 *
 * @module reload-emitter
 */

import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  invalidateRenderCache,
  invalidateWikiCache,
  invalidateVulnCache,
} from "./render-markdown";
import { invalidateBacklinksCache } from "./backlinks";

const _emitter = new EventEmitter();

const TOKEN_PATH = path.join(tmpdir(), "noty-reload-token");

function readToken(): number {
  try {
    if (existsSync(TOKEN_PATH)) {
      const val = parseInt(readFileSync(TOKEN_PATH, "utf-8"), 10);
      return Number.isNaN(val) ? 0 : val;
    }
  } catch {
    // ignore
  }
  return 0;
}

function writeToken(val: number): void {
  try {
    writeFileSync(TOKEN_PATH, String(val), "utf-8");
  } catch {
    // ignore
  }
}

/**
 * The singleton reload emitter.  SSE route handlers subscribe to this
 * emitter; the file watcher publishes `reload` events on it.
 */
export function getReloadEmitter(): EventEmitter {
  return _emitter;
}

/**
 * Return a monotonically-increasing token that changes on every reload.
 */
export function getReloadToken(): number {
  return readToken();
}

/**
 * Bump the global reload token, clear all server-side caches, and emit a
 * reload event so clients know to refresh.
 */
export function bumpReloadToken(): void {
  const next = readToken() + 1;
  writeToken(next);

  invalidateRenderCache();
  invalidateWikiCache();
  invalidateVulnCache();
  invalidateBacklinksCache();

  _emitter.emit("reload", next);
}
