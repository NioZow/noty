import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TOKEN_PATH =
  process.env.NOTY_RELOAD_TOKEN_FILE ?? path.join(tmpdir(), "noty-reload-token");

export function getReloadToken(): number {
  try {
    if (!existsSync(TOKEN_PATH)) return 0;
    const val = parseInt(readFileSync(TOKEN_PATH, "utf-8"), 10);
    return Number.isNaN(val) ? 0 : val;
  } catch {
    return 0;
  }
}

export function writeReloadToken(val: number): void {
  try {
    const tmp = `${TOKEN_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, String(val), "utf-8");
    renameSync(tmp, TOKEN_PATH);
  } catch {
    // ignore
  }
}

interface GlobalReloadToken {
  __noty_last_reload_token?: number;
}
const _global = globalThis as unknown as GlobalReloadToken;

/**
 * Return true exactly when the on-disk token has changed since the last call
 * in this process. Used by server render paths to invalidate their caches.
 */
export function syncReloadToken(): boolean {
  const token = getReloadToken();
  if (_global.__noty_last_reload_token === token) return false;
  _global.__noty_last_reload_token = token;
  return true;
}
