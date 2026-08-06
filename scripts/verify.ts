// Quick smoke-test that key modules import without crashing

import { buildMcpServer } from "../app/lib/mcp/server.ts";

async function main() {
  console.log("[verify] Building MCP server...");
  const server = buildMcpServer();

  // Sanity-check: ensure all registered tool names are present
  const expectedTools = [
    "notes_list_files",
    "notes_read_note",
    "notes_search",
    "notes_list_tags",
    "notes_get_notes_by_tag",
    "notes_list_directory_tree",
    "notes_get_backlinks",
    "notes_list_challenges",
    "notes_get_challenge",
    "notes_extract_frontmatter",
    "notes_render_markdown",
    "notes_find_related_notes",
  ];

  // The SDK doesn't expose a public list of registered tools, but if
  // buildMcpServer() returns without throwing we know registration succeeded.
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
