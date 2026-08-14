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
  type ListFilesInput,
  type ReadNoteInput,
  type SearchInput,
  type TagInput,
  type PathInput,
  type ListChallengesInput,
  type GetChallengeInput,
  type GetFrontmatterInput,
  type RenderMarkdownInput,
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
  // Explicitly widened to z.ZodRawShape (rather than left as an inferred
  // literal) so TypeScript checks each field structurally against the SDK's
  // zod3/zod4-compat `AnySchema` union instead of trying to resolve the
  // full chained builder type — with ~13 registerTool() calls in this file
  // the narrow-literal version blows past tsc's instantiation-depth limit
  // ("Type instantiation is excessively deep and possibly infinite").
  const listFilesSchema: z.ZodRawShape = {
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
  };
  server.registerTool(
    "notes_list_files",
    {
      description:
        "List files in the notes directory with optional filtering.\n\nReturns a JSON object with files array, total count, offset and limit. Useful for discovering what notes are available before reading them.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: listFilesSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ListFilesInput) => {
      const result = await listFiles(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_read_note
  // -----------------------------------------------------------------------
  const readNoteSchema: z.ZodRawShape = {
    path: z.string().min(1).describe("Relative path to the note file (e.g., 'projects/ideas.md')."),
    format: z
      .enum(["raw", "rendered"])
      .default("raw")
      .describe("Output format: 'raw' for markdown source, 'rendered' for HTML body without frontmatter."),
  };
  server.registerTool(
    "notes_read_note",
    {
      description:
        "Read a specific note by relative path.\n\nReturns the note content as JSON with keys: path, frontmatter, content. Use format='raw' for markdown source (best for LLM analysis). Use format='rendered' for HTML body (best for viewing structure).",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: readNoteSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ReadNoteInput) => {
      const result = await readNote(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_search
  // -----------------------------------------------------------------------
  const searchNotesSchema: z.ZodRawShape = {
    query: z.string().min(1).max(500).describe("Search query string (case-insensitive substring match)."),
    directory: z.string().default("").describe("Optional subdirectory to restrict the search scope."),
    limit: z.number().min(1).max(500).default(50).describe("Maximum number of matches to return"),
  };
  server.registerTool(
    "notes_search",
    {
      description:
        "Full-text search across all notes.\n\nSearches file contents for a query string (case-insensitive). Returns matching files with line numbers and context snippets. Use this to find topics, concepts, or specific text across your knowledge base.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: searchNotesSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: SearchInput) => {
      const result = await searchNotes(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_get_notes_by_tag
  // -----------------------------------------------------------------------
  const getNotesByTagSchema: z.ZodRawShape = {
    tag: z.string().min(1).describe("Tag name to search for"),
  };
  server.registerTool(
    "notes_get_notes_by_tag",
    {
      description:
        "Get all markdown notes that have a specific tag.\n\nReturns note names, paths, and frontmatter for matching notes. Use after listing tags to explore notes on a specific topic.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: getNotesByTagSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: TagInput) => {
      const result = await getNotesByTag(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_list_directory_tree
  // -----------------------------------------------------------------------
  const listDirectoryTreeSchema: z.ZodRawShape = {
    path: z.string().default("").describe("Relative path to the note or directory."),
  };
  server.registerTool(
    "notes_list_directory_tree",
    {
      description:
        "List the directory tree structure starting from a path.\n\nReturns a nested JSON tree of files and directories. Use this to understand the organization of your notes.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: listDirectoryTreeSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: PathInput) => {
      const result = await listDirectoryTree(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_get_backlinks
  // -----------------------------------------------------------------------
  const getBacklinksSchema: z.ZodRawShape = {
    path: z.string().min(1).describe("Relative path to the note or directory."),
  };
  server.registerTool(
    "notes_get_backlinks",
    {
      description:
        "Get all notes that link TO a specific note via wiki-links.\n\nReturns a list of backlink dicts with 'name' and 'path' keys. Use this to understand how a note is referenced throughout your knowledge base.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: getBacklinksSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: PathInput) => {
      const result = await getBacklinksForNote(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_list_challenges
  // -----------------------------------------------------------------------
  const listChallengesSchema: z.ZodRawShape = {
    category: z.string().default("").describe("Optional category filter"),
    platform: z.string().default("").describe("Optional platform filter"),
    tag: z.string().default("").describe("Optional tag filter"),
    solved_only: z.boolean().default(false).describe("Only include solved challenges"),
    limit: z.number().min(1).max(500).default(50).describe("Maximum number of challenges to return"),
    offset: z.number().min(0).default(0).describe("Number of results to skip for pagination"),
  };
  server.registerTool(
    "notes_list_challenges",
    {
      description:
        "List CTF/security challenges from the challenge database.\n\nSupports filtering by category, platform, tag, and solved status. Returns challenge metadata including TLDR, tags, and solve scripts.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: listChallengesSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: ListChallengesInput) => {
      const result = await listChallenges(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_get_challenge
  // -----------------------------------------------------------------------
  const getChallengeSchema: z.ZodRawShape = {
    name_or_path: z.string().min(1).describe("Challenge name or relative README path"),
  };
  server.registerTool(
    "notes_get_challenge",
    {
      description:
        "Get detailed information about a specific challenge.\n\nLook up by challenge name or README path. Returns full metadata, tags, links, and solve scripts.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: getChallengeSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: GetChallengeInput) => {
      const result = await getChallenge(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_extract_frontmatter
  // -----------------------------------------------------------------------
  const getFrontmatterSchema: z.ZodRawShape = {
    path: z.string().min(1).describe("Relative path to the markdown file"),
  };
  server.registerTool(
    "notes_extract_frontmatter",
    {
      description:
        "Extract YAML frontmatter metadata from a markdown file.\n\nReturns the frontmatter dict and a preview of the body. Use this to quickly inspect metadata without reading the full note.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: getFrontmatterSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: GetFrontmatterInput) => {
      const result = await getFrontmatter(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_render_markdown
  // -----------------------------------------------------------------------
  const renderMarkdownSchema: z.ZodRawShape = {
    content: z.string().min(1).describe("Markdown content to render"),
  };
  server.registerTool(
    "notes_render_markdown",
    {
      description:
        "Render raw markdown content to HTML.\n\nUseful for previewing markdown or converting snippets to HTML. Supports all renderer features: math, chess diagrams, callouts, etc.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: renderMarkdownSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: RenderMarkdownInput) => {
      const result = await renderMarkdownTool(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // -----------------------------------------------------------------------
  // notes_find_related_notes
  // -----------------------------------------------------------------------
  const findRelatedNotesSchema: z.ZodRawShape = {
    path: z.string().min(1).describe("Relative path to the note or directory."),
  };
  server.registerTool(
    "notes_find_related_notes",
    {
      description:
        "Find notes related to a given note.\n\nReturns notes that share tags, backlinks, or are in the same directory. Useful for exploring connections in your knowledge graph.",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: findRelatedNotesSchema as any,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (params: PathInput) => {
      const result = await findRelatedNotes(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}
