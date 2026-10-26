/**
 * Global EventEmitter used to broadcast file-change "reload" events from the
 * file watcher to all connected SSE clients.
 *
 * The token is persisted to a temp file so that the standalone watcher
 * process and the Next.js server process share the same value.
 *
 * @module reload-emitter
 */

import { EventEmitter } from "node:events";
import { getReloadToken, writeReloadToken } from "./reload-token";
import {
  invalidateRenderCache,
  invalidateWikiCache,
  invalidateVulnCache,
} from "./render-markdown";
import { invalidateBacklinksCache } from "./backlinks";

export { getReloadToken } from "./reload-token";

const _emitter = new EventEmitter();

/**
 * The singleton reload emitter.  SSE route handlers subscribe to this
 * emitter; the file watcher publishes `reload` events on it.
 */
export function getReloadEmitter(): EventEmitter {
  return _emitter;
}

/**
 * Clear all server-side render caches.
 */
export function invalidateAllCaches(): void {
  invalidateRenderCache();
  invalidateWikiCache();
  invalidateVulnCache();
  invalidateBacklinksCache();
}

/**
 * Bump the global reload token, clear all server-side caches, and emit a
 * reload event so clients know to refresh.
 */
export function bumpReloadToken(): void {
  const next = getReloadToken() + 1;
  writeReloadToken(next);

  invalidateRenderCache();
  invalidateWikiCache();
  invalidateVulnCache();
  invalidateBacklinksCache();

  _emitter.emit("reload", next);
}
