/**
 * Next.js startup hook.
 *
 * `register()` runs exactly once when the server process boots (both
 * `next dev` and `next start`), before the app serves requests. Used here to
 * make sure the SQLite database backing the challenges/vulnerabilities
 * pages actually exists and is populated — previously nothing ever called
 * the sync logic in `app/lib/sync/*`, so those pages always rendered empty.
 *
 * The actual work lives in `instrumentation-node.ts`, reached only through
 * this dynamic import, so the Node-only bits never get pulled into the Edge
 * runtime bundle.
 *
 * @module instrumentation
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runStartupSync } = await import("./instrumentation-node");
  await runStartupSync();
}
