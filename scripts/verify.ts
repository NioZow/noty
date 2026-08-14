// Quick smoke-test that key modules import without crashing

import { buildMcpServer } from "../app/lib/mcp/server.ts";

async function main() {
  console.log("[verify] Building MCP server...");
  // The SDK doesn't expose a public list of registered tools, but if
  // buildMcpServer() returns without throwing we know registration succeeded.
  buildMcpServer();
  console.log("[verify] MCP server instantiated successfully.");

  // Test that getReloadEmitter works
  const { getReloadEmitter } = await import("../app/lib/reload-emitter.ts");
  const emitter = getReloadEmitter();
  emitter.once("reload", (payload) => {
    console.log("[verify] Reload event received:", payload);
  });
  emitter.emit("reload", { path: "/test.md", event: "change" });

  console.log("[verify] All checks passed.");
}

main().catch((err) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
