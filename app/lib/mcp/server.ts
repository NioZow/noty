/**
 * MCP server builder and route handler.
 *
 * Builds an {@link McpServer} instance, registers all ported tools, and
 * exposes a single Route Handler (`app/mcp/route.ts`) via the Web-Standard
 * HTTP transport so that the Next.js dev server can act as an MCP host.
 *
 * @module mcp/server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";
import {
  listFiles,
  readNote,
  searchNotes,
  listTags,
  getNotesByTag,
  listDirectoryTree,
  getBacklinksForNote,
  listChallenges,
  getChallenge,
  getFrontmatter,
  renderMarkdown as renderMarkdownTool,
  findRelatedNotes,
} from "../mcp/tools";

/**
 * Return a fully-configured {@link McpServer} with all markdown-render tools.
 *
 * The server is wired to the notes directory via the existing config layer
 * (`app/lib/config.ts`) so no extra initialisation is needed here.
 */
export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "notes-mcp",
    version: "1.0.0",
  });

  // -----------------------------------------------------------------------
  // notes_list_files
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_list_files",
    {
      description:
        "List files in the notes directory with optional filtering.\n\nReturns a JSON object with files array, total count, offset and limit. Useful for discovering what notes are available before reading them.",
      inputSchema: {
        directory: z
          .string()
          .default("")
          .describe("Relative subdirectory to scope the listing (e.g., 'projects', 'chess'). Defaults to root."),
        extension: z
          .string()
          .default("")
          .describe("Optional file extension filter, e.g. '.md', '.py'. Leave empty for all files."),
        limit: z.number().min(1).max(500).default(50).describe("Maximum number of files to return"),
        offset: z.number().min(0).default(0).describe("Number of results to skip for pagination"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await listFiles(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_read_note
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_read_note",
    {
      description:
        "Read a specific note by relative path.\n\nReturns the note content as JSON with keys: path, frontmatter, content. Use format='raw' for markdown source (best for LLM analysis). Use format='rendered' for HTML body (best for viewing structure).",
      inputSchema: {
        path: z.string().min(1).describe("Relative path to the note file (e.g., 'projects/ideas.md')."),
        format: z
          .enum(["raw", "rendered"])
          .default("raw")
          .describe("Output format: 'raw' for markdown source, 'rendered' for HTML body without frontmatter."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await readNote(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_search
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_search",
    {
      description:
        "Full-text search across all notes.\n\nSearches file contents for a query string (case-insensitive). Returns matching files with line numbers and context snippets. Use this to find topics, concepts, or specific text across your knowledge base.",
      inputSchema: {
        query: z.string().min(1).max(500).describe("Search query string (case-insensitive substring match)."),
        directory: z.string().default("").describe("Optional subdirectory to restrict the search scope."),
        limit: z.number().min(1).max(500).default(50).describe("Maximum number of matches to return"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await searchNotes(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_list_tags
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_list_tags",
    {
      description:
        "List all unique tags used across notes and challenges.\n\nTags come from YAML frontmatter 'tags' field and challenge database. Use this to discover the topics and categories in your knowledge base.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const result = await listTags();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_get_notes_by_tag
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_get_notes_by_tag",
    {
      description:
        "Get all markdown notes that have a specific tag.\n\nReturns note names, paths, and frontmatter for matching notes. Use after listing tags to explore notes on a specific topic.",
      inputSchema: {
        tag: z.string().min(1).describe("Tag name to search for"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await getNotesByTag(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_list_directory_tree
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_list_directory_tree",
    {
      description:
        "List the directory tree structure starting from a path.\n\nReturns a nested JSON tree of files and directories. Use this to understand the organization of your notes.",
      inputSchema: {
        path: z.string().default("").describe("Relative path to the note or directory."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await listDirectoryTree(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_get_backlinks
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_get_backlinks",
    {
      description:
        "Get all notes that link TO a specific note via wiki-links.\n\nReturns a list of backlink dicts with 'name' and 'path' keys. Use this to understand how a note is referenced throughout your knowledge base.",
      inputSchema: {
        path: z.string().min(1).describe("Relative path to the note or directory."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await getBacklinksForNote(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_list_challenges
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_list_challenges",
    {
      description:
        "List CTF/security challenges from the challenge database.\n\nSupports filtering by category, platform, tag, and solved status. Returns challenge metadata including TLDR, tags, and solve scripts.",
      inputSchema: {
        category: z.string().default("").describe("Optional category filter"),
        platform: z.string().default("").describe("Optional platform filter"),
        tag: z.string().default("").describe("Optional tag filter"),
        solved_only: z.boolean().default(false).describe("Only include solved challenges"),
        limit: z.number().min(1).max(500).default(50).describe("Maximum number of challenges to return"),
        offset: z.number().min(0).default(0).describe("Number of results to skip for pagination"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await listChallenges(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_get_challenge
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_get_challenge",
    {
      description:
        "Get detailed information about a specific challenge.\n\nLook up by challenge name or README path. Returns full metadata, tags, links, and solve scripts.",
      inputSchema: {
        name_or_path: z.string().min(1).describe("Challenge name or relative README path"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await getChallenge(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_extract_frontmatter
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_extract_frontmatter",
    {
      description:
        "Extract YAML frontmatter metadata from a markdown file.\n\nReturns the frontmatter dict and a preview of the body. Use this to quickly inspect metadata without reading the full note.",
      inputSchema: {
        path: z.string().min(1).describe("Relative path to the markdown file"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await getFrontmatter(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_render_markdown
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_render_markdown",
    {
      description:
        "Render raw markdown content to HTML.\n\nUseful for previewing markdown or converting snippets to HTML. Supports all renderer features: math, chess diagrams, callouts, etc.",
      inputSchema: {
        content: z.string().min(1).describe("Markdown content to render"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await renderMarkdownTool(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_find_related_notes
  // -----------------------------------------------------------------------
  server.registerTool(
    "notes_find_related_notes",
    {
      description:
        "Find notes related to a given note.\n\nReturns notes that share tags, backlinks, or are in the same directory. Useful for exploring connections in your knowledge graph.",
      inputSchema: {
        path: z.string().min(1).describe("Relative path to the note or directory."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params) => {
      const result = await findRelatedNotes(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
