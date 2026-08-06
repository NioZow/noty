/**
 * Polling endpoint that returns the current "reload" token.
 *
 * Instead of holding a long-lived SSE connection (which exhausts the
 * Next.js dev-server connection pool and causes hangs), the client polls
 * this lightweight endpoint every few seconds.  When the returned token
 * changes, the client reloads the page.
 *
 * @module api/reload/route
 */

import { getReloadToken } from "@/app/lib/reload-emitter";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (process.env.DISABLE_HOT_RELOAD === "1") {
    return new Response(JSON.stringify({ token: 0, disabled: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ token: getReloadToken() }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
