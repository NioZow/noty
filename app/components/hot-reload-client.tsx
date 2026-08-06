"use client";

import React from "react";

const POLL_MS = 3000;

/**
 * Client-side hook that polls `/api/reload` for a token change and reloads
 * the page when the token has been bumped by the file watcher.
 *
 * Polling is used instead of SSE because Next.js dev mode has a small
 * connection pool; holding a persistent SSE stream open starves other
 * requests and causes the browser to hang while waiting for the page HTML.
 */
export function useHotReload() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;

    let lastToken = 0;
    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/reload", {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { token?: number };
        const token = json.token ?? 0;

        if (lastToken === 0) {
          lastToken = token;
          return;
        }

        if (token !== lastToken) {
          window.location.reload();
        }
      } catch {
        // ignore
      }
    }

    tick();
    const interval = setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
}

export function HotReloadClient() {
  useHotReload();
  return null;
}
