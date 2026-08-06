/**
 * Global EventEmitter used to broadcast file-change "reload" events from the
 * file watcher to all connected SSE clients.
 *
 * @module reload-emitter
 */

import { EventEmitter } from "node:events";

const _emitter = new EventEmitter();

let _lastToken = 0;

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
  return _lastToken;
}

/**
 * Bump the global reload token and emit a reload event.
 */
export function bumpReloadToken(): void {
  _lastToken++;
  _emitter.emit("reload", _lastToken);
}
