/**
 * Configuration loader for the markdown-render rewrite.
 *
 * Port of the original Python `src/renderer/config.py`. Reads
 * `~/.config/markdown-render/config.yml` and merges it over the built-in
 * defaults. Keys use snake_case on purpose so the shape matches the YAML
 * config file (and the Python API) one-to-one.
 *
 * Cache lives on `globalThis` so it survives Turbopack dev-server module
 * invalidation.
 *
 * @module config
 */

import { statSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

/** Path to the user configuration file. */
export const CONFIG_PATH: string = path.join(
  os.homedir(),
  ".config",
  "markdown-render",
  "config.yml",
);

/** Chess board rendering configuration. */
export interface ChessBoardConfig {
  /** Board theme: classic | neo | green | midnight | walnut | dark-blue */
  theme: string;
  /** Optional square-colour overrides. */
  colors: Record<string, string>;
  /** Optional path to custom SVG piece files. */
  pieces_dir: string;
}

/** Fully-merged application configuration (defaults + config.yml). */
export interface MarkdownRenderConfig {
  /** Root directory of the notes collection. */
  notes_dir: string;
  /** Optional root directory for challenge/vulnerability discovery. */
  challenges_root: string;
  /** Path of the SQLite database backing the challenges/vulnerabilities store. */
  challenges_db_path: string;
  /** Chess board rendering configuration. */
  chess_board: ChessBoardConfig;
  /** Directories searched for user-defined Jinja-style templates. */
  templates_search_dirs: string[];
  /** Whether the MCP server integration is enabled. */
  mcp_enabled: boolean;
}

interface GlobalCache {
  config?: { value: MarkdownRenderConfig; mtimeMs: number };
}

const _global = globalThis as unknown as GlobalCache;

/**
 * Build the default configuration (fresh objects on every call, like the
 * Python `_DEFAULT.copy()` semantics in `load()`).
 *
 * @returns A fresh default configuration object
 */
function buildDefaultConfig(): MarkdownRenderConfig {
  const homeDir = os.homedir();
  return {
    notes_dir: path.join(homeDir, "notes"),
    challenges_root: "",
    challenges_db_path: path.join(homeDir, ".cache", "markdown-render", "challenges.db"),
    chess_board: {
      theme: "classic",
      colors: {},
      pieces_dir: "",
    },
    templates_search_dirs: ["assets"],
    mcp_enabled: true,
  };
}

/**
 * Narrow an unknown value to a plain record (non-array object).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Expand a leading `~` to the current user's home directory.
 */
export function expandUser(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/**
 * Load the merged configuration: defaults overridden by config.yml values.
 *
 * Cached on `globalThis` keyed by config file `mtime`, so we only re-read
 * when the file has actually changed.
 */
export function load(): MarkdownRenderConfig {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(CONFIG_PATH).mtimeMs;
  } catch {
    // file doesn't exist — use defaults
    if (_global.config) {
      return _global.config.value;
    }
    const config = buildDefaultConfig();
    _global.config = { value: config, mtimeMs: 0 };
    return config;
  }

  if (_global.config && _global.config.mtimeMs === mtimeMs) {
    return _global.config.value;
  }

  const config = buildDefaultConfig();

  try {
    const rawText = readFileSync(CONFIG_PATH, "utf-8");
    const userConfig: unknown = loadYaml(rawText);

    if (isRecord(userConfig)) {
      if (typeof userConfig.notes_dir === "string") {
        config.notes_dir = userConfig.notes_dir;
      }
      if (typeof userConfig.challenges_root === "string") {
        config.challenges_root = userConfig.challenges_root;
      }
      if (typeof userConfig.challenges_db_path === "string") {
        config.challenges_db_path = userConfig.challenges_db_path;
      }
      if (isRecord(userConfig.chess_board)) {
        config.chess_board = {
          ...buildDefaultConfig().chess_board,
          ...userConfig.chess_board,
        } as ChessBoardConfig;
      }
      if (Array.isArray(userConfig.templates_search_dirs)) {
        config.templates_search_dirs = userConfig.templates_search_dirs.map(String);
      }
      if (userConfig.mcp_enabled !== undefined && userConfig.mcp_enabled !== null) {
        config.mcp_enabled = Boolean(userConfig.mcp_enabled);
      }
    }
  } catch {
    // ignore malformed YAML, fall back to defaults
  }

  _global.config = { value: config, mtimeMs };
  return config;
}

/**
 * Whether the MCP server integration is enabled (default: true).
 */
export function mcpEnabled(): boolean {
  return load().mcp_enabled;
}

/**
 * Chess board configuration.
 */
export function chessBoardConfig(): ChessBoardConfig {
  return load().chess_board;
}

/**
 * Root directory of the notes collection, with `~` expanded.
 */
export function notesDir(): string {
  return expandUser(load().notes_dir);
}

/**
 * Root directory for challenge discovery, with `~` expanded.
 */
export function challengesRoot(): string | null {
  const root = load().challenges_root;
  if (root) {
    return expandUser(root);
  }
  return null;
}

/**
 * Path of the challenges/vulnerabilities SQLite database, with `~` expanded.
 */
export function challengesDbPath(): string {
  return expandUser(load().challenges_db_path);
}
