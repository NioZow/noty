"use client";

import React from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 1500;
const MIN_RELOAD_MS = 3000; // debounce: never reload more often than 3s

/**
 * Client-side hook that polls `/api/reload` for a token change and refreshes
 * the current route data when the token changes.
 *
 * Uses `router.refresh()` instead of `window.location.reload()` so the update
 * is smooth (no full page flash) and scroll position is preserved.
 */
export function useHotReload() {
  const router = useRouter();

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "development") return;

    let lastToken: number | null = null;
    let cancelled = false;
    let lastReloadAt = 0;

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

        if (lastToken === null) {
          lastToken = token;
          return;
        }

        if (token !== lastToken) {
          lastToken = token;
          const now = Date.now();
          if (now - lastReloadAt < MIN_RELOAD_MS) {
            // Too soon since last reload — skip this one
            return;
          }
          lastReloadAt = now;
          console.log("[hot-reload] Content changed, refreshing…");
          router.refresh();
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
  }, [router]);
}

export function HotReloadClient() {
  useHotReload();
  return null;
}
