/**
 * Interactive Chess Board React component.
 *
 * Port of the original Python `chess_renderer.py`.
 * Parses YAML from ` ```chess ` blocks and renders either:
 * - A static SVG board (no moves)
 * - An interactive step-through board using `react-chessboard`
 *
 * @module chess-board
 */

"use client";

import React from "react";
import { Chessboard } from "react-chessboard";
import type { Arrow, PieceRenderObject } from "react-chessboard";
import { Chess, validateFen } from "chess.js";
import { load as loadYaml } from "js-yaml";

import neoBB from "@/public/chess/pieces/neo/bB.svg";
import neoBK from "@/public/chess/pieces/neo/bK.svg";
import neoBN from "@/public/chess/pieces/neo/bN.svg";
import neoBP from "@/public/chess/pieces/neo/bP.svg";
import neoBQ from "@/public/chess/pieces/neo/bQ.svg";
import neoBR from "@/public/chess/pieces/neo/bR.svg";
import neoWB from "@/public/chess/pieces/neo/wB.svg";
import neoWK from "@/public/chess/pieces/neo/wK.svg";
import neoWN from "@/public/chess/pieces/neo/wN.svg";
import neoWP from "@/public/chess/pieces/neo/wP.svg";
import neoWQ from "@/public/chess/pieces/neo/wQ.svg";
import neoWR from "@/public/chess/pieces/neo/wR.svg";

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

const THEMES: Record<string, BoardColors> = {
  classic: {
    lightSquare: "#f0d9b5",
    darkSquare: "#b58863",
    margin: "#212121",
    coord: "#e0e0e0",
  },
  neo: {
    lightSquare: "#cdd6db",
    darkSquare: "#557f8e",
    margin: "#1c2b33",
    coord: "#8ab4c4",
  },
  green: {
    lightSquare: "#ffffdd",
    darkSquare: "#86a666",
    margin: "#2b2b2b",
    coord: "#cccccc",
  },
  midnight: {
    lightSquare: "#6b7fa3",
    darkSquare: "#2c3e6b",
    margin: "#111827",
    coord: "#8899cc",
  },
  walnut: {
    lightSquare: "#f0cfa0",
    darkSquare: "#8b5a2b",
    margin: "#3d1f0a",
    coord: "#d4a870",
  }, "dark-blue": {
    lightSquare: "#8ca2ad",
    darkSquare: "#547e97",
    margin: "#1c2d3a",
    coord: "#c4d8e2",
  },
};

const DEFAULT_THEME = "classic";

/**
 * React-chessboard piece identifiers. The order here doesn't matter; each key
 * is a `<color><type>` pair (e.g. `wK` = white king).
 */
const PIECE_KEYS = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"] as const;

/**
 * A `<color><type>` -> bundled SVG asset map for a single theme. Follows the
 * convention `{W}K` for white king etc., next to the `react-chessboard` keys.
 */
type ThemePieces = Partial<Record<(typeof PIECE_KEYS)[number], string>>;

/**
 * SVG piece assets bundled from `chess/pieces/neo/`. Statically imported so
 * Next.JS copies them into the build and returns stable public URLs.
 */
const NEO_PIECES: ThemePieces = {
  wP: neoWP,
  wN: neoWN,
  wB: neoWB,
  wR: neoWR,
  wQ: neoWQ,
  wK: neoWK,
  bP: neoBP,
  bN: neoBN,
  bB: neoBB,
  bR: neoBR,
  bQ: neoBQ,
  bK: neoBK,
};

/**
 * Themes that ship custom SVG piece assets. Add any new theme directory (e.g.
 * `chess/pieces/<theme>/`) here to have its pieces used automatically.
 */
const CUSTOM_PIECE_THEMES: Readonly<Record<string, ThemePieces>> = {
  neo: NEO_PIECES,
};

/**
 * Build a `pieces` prop for `react-chessboard` from a theme's SVG assets.
 * Returns `undefined` for themes without custom assets so react-chessboard's
 * built-in pieces are used (never renders empty squares).
 */
function buildThemePieces(theme: string): PieceRenderObject | undefined {
  const assets = CUSTOM_PIECE_THEMES[theme];
  if (!assets) return undefined;

  const pieces: PieceRenderObject = {};
  for (const key of PIECE_KEYS) {
    const url = assets[key];
    if (url) {
      pieces[key] = (props) => (
        <img
          src={url}
          alt={key}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            ...props?.svgStyle,
          }}
        />
      );
    }
  }
  return pieces;
}

/**
 * Construct a Chess instance from a FEN that may describe a diagram-only
 * position (e.g. missing a king) rather than a legal, in-progress game.
 * Full validation already happened in `boardFromData`, so re-parsing a FEN
 * derived from it (or passed through from it) can safely skip validation.
 */
function newChess(fen?: string): Chess {
  return fen ? new Chess(fen, { skipValidation: true }) : new Chess();
}

interface BoardColors {
  lightSquare: string;
  darkSquare: string;
  margin: string;
  coord: string;
}

// ---------------------------------------------------------------------------
// Annotation styles
// ---------------------------------------------------------------------------

const ANNOTATION_SUFFIXES: [string, string][] = [
  ["!!", "brilliant"],
  ["??", "blunder"],
  ["!?", "interesting"],
  ["?!", "dubious"],
  ["!", "good"],
  ["?", "mistake"],
  ["~", "forced"],
  ["N", "novelty"],
];

const ANNOTATION_STYLE: Record<string, [string, string]> = {
  brilliant: ["!!", "#1baca6"],
  good: ["!", "#5c8aff"],
  interesting: ["!?", "#7fa650"],
  dubious: ["?!", "#f0a800"],
  mistake: ["?", "#e07000"],
  blunder: ["??", "#ca3431"],
  forced: ["~", "#c97b1a"],
  novelty: ["N", "#9b59b6"],
};

// ---------------------------------------------------------------------------
// Chess board component
// ---------------------------------------------------------------------------

export interface ChessBoardProps {
  /** Raw YAML content from the code block. */
  yamlSource: string;
  /** Per-file chess_board config from frontmatter. */
  fileConfig?: Record<string, unknown> | null;
}

/**
 * Render a chess diagram from YAML block content.
 */
export function ChessBoard({ yamlSource, fileConfig }: ChessBoardProps) {
  try {
    const data = parseBlock(yamlSource);
    const board = boardFromData(data);

    const globalConfig: Record<string, unknown> = {}; // TODO: wire to config.ts in a server/client-safe way
    const colors = resolveColors(data, fileConfig ?? {}, globalConfig);
    const theme = resolveTheme(data, fileConfig ?? {}, globalConfig);
    const pieces = buildThemePieces(theme);
    const orientation =
      String(data.orientation ?? "white").toLowerCase() === "black" ? "black" : "white";

    const moves = (data.moves as ParsedStep[] | undefined) ?? [];

    if (moves.length === 0) {
      return (
        <StaticBoard
          fen={board.fen()}
          caption={data.caption as string | undefined}
          colors={colors}
          pieces={pieces}
          orientation={orientation as "white" | "black"}
          arrows={(data.arrows as ArrowDef[] | undefined) ?? []}
          highlight={data.highlight as string[] | undefined}
        />
      );
    }

    return (
      <InteractiveBoard
        initialFen={board.fen()}
        steps={moves}
        caption={data.caption as string | undefined}
        colors={colors}
        pieces={pieces}
        orientation={orientation as "white" | "black"}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return <div className="chess-error">Chess error: {message}</div>;
  }
}

// ---------------------------------------------------------------------------
// Static board
// ---------------------------------------------------------------------------

function StaticBoard(props: {
  fen: string;
  caption?: string;
  colors: BoardColors;
  pieces?: PieceRenderObject;
  orientation: "white" | "black";
  arrows: ArrowDef[];
  highlight?: string[];
}) {
  const { fen, caption, colors, pieces, orientation, arrows, highlight } = props;
  const turnText =
    newChess(fen).turn() === "w" ? "White to move" : "Black to move";
  const figCaption = caption ? `${caption} — ${turnText}` : turnText;

  return (
    <figure className="chess-board">
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          boardStyle: {
            borderRadius: "0",
            border: `4px solid ${colors.margin}`,
          },
          darkSquareStyle: { backgroundColor: colors.darkSquare },
          lightSquareStyle: { backgroundColor: colors.lightSquare },
          pieces,
          arrows: toCustomArrows(arrows),
          squareStyles: buildSquareStyles(highlight),
          allowDrawingArrows: false,
          showNotation: true,
        }}
      />
      <figcaption>{figCaption}</figcaption>
      <OpenOnChessCom fen={fen} />
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Interactive board
// ---------------------------------------------------------------------------

function InteractiveBoard(props: {
  initialFen: string;
  steps: ParsedStep[];
  caption?: string;
  colors: BoardColors;
  pieces?: PieceRenderObject;
  orientation: "white" | "black";
}) {
  const { initialFen, steps, caption, colors, pieces, orientation } = props;
  const [index, setIndex] = React.useState(0);

  const game = React.useMemo(() => {
    const g = newChess(initialFen);
    for (let i = 0; i < index; i++) {
      const step = steps[i];
      if (step?.san) {
        try {
          g.move(step.san, { strict: false });
        } catch {
          /* ignore illegal */
        }
      }
    }
    return g;
  }, [index, initialFen, steps]);

  const currentFen = game.fen();
  const currentStep = steps[index - 1];

  const labelParts: { text: string; annotation?: string }[] = [];
  {
    const g = newChess(initialFen);
    for (let i = 0; i < index; i++) {
      const step = steps[i];
      if (!step?.san) continue;
      const isWhite = g.turn() === "w";
      const moveNum = g.moveNumber();
      let san = step.san;
      let ann: string | undefined;
      for (const [suffix, annType] of ANNOTATION_SUFFIXES) {
        if (annType === "novelty" && san.endsWith("=N")) continue;
        if (san.endsWith(suffix)) {
          san = san.slice(0, -suffix.length);
          ann = annType;
          break;
        }
      }
      const token = isWhite ? `${moveNum}.${san}` : san;
      labelParts.push({ text: token, annotation: ann });
      try {
        g.move(san);
      } catch {
        break;
      }
    }
  }

  const captionText =
    index === 0
      ? caption
        ? `${caption} — ${game.turn() === "w" ? "White to move" : "Black to move"}`
        : game.turn() === "w"
          ? "White to move"
          : "Black to move"
      : currentStep?.caption ?? "";

  return (
    <figure className="chess-board chess-interactive">
      <div className="chess-steps">
        <Chessboard
          options={{
            position: currentFen,
            boardOrientation: orientation,
            boardStyle: {
              borderRadius: "0",
              border: `4px solid ${colors.margin}`,
            },
            darkSquareStyle: { backgroundColor: colors.darkSquare },
            lightSquareStyle: { backgroundColor: colors.lightSquare },
            pieces,
            arrows: toCustomArrows(currentStep?.arrows ?? []),
            squareStyles: buildSquareStyles(currentStep?.highlight),
            allowDrawingArrows: false,
            showNotation: true,
          }}
        />
      </div>
      <div className="chess-nav">
        <button
          className="chess-prev"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          type="button"
        >
          &#8592;
        </button>
        <span className="chess-move-label">
          {labelParts.map((p, i) => (
            <span key={i}>
              {p.text}
              {p.annotation && <AnnotationBadge type={p.annotation} />}{" "}
            </span>
          ))}
        </span>
        <button
          className="chess-next"
          disabled={index >= steps.length}
          onClick={() => setIndex((i) => Math.min(steps.length, i + 1))}
          type="button"
        >
          &#8594;
        </button>
      </div>
      <figcaption>{captionText}</figcaption>
      <OpenOnChessCom fen={currentFen} />
    </figure>
  );
}

function AnnotationBadge({ type }: { type: string }) {
  const style = ANNOTATION_STYLE[type];
  if (!style) return null;
  const [symbol, color] = style;
  return (
    <span
      className="chess-ann"
      style={{ backgroundColor: color }}
    >
      {symbol}
    </span>
  );
}

function OpenOnChessCom({ fen }: { fen: string }) {
  const url = `https://www.chess.com/analysis?fen=${encodeURIComponent(fen)}`;
  return (
    <a className="chess-open" href={url} target="_blank" rel="noopener noreferrer">
      Open on chess.com ↗
    </a>
  );
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

interface ParsedStep {
  san?: string;
  caption?: string;
  arrows?: ArrowDef[];
  highlight?: string[];
}

interface ArrowDef {
  from?: string;
  to?: string;
  color?: string;
}

function parseBlock(source: string): Record<string, unknown> {
  try {
    const data = parseYamlLite(source);
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Chess block must be a YAML mapping");
    }
    const d = data as Record<string, unknown>;
    if (!d.fen && !d.pgn) {
      throw new Error("Chess block must have either 'fen' or 'pgn'");
    }
    return d;
  } catch (err) {
    throw new Error(`Invalid chess block YAML: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function boardFromData(data: Record<string, unknown>): Chess {
  const pgn = data.pgn;
  if (typeof pgn === "string") {
    // chess.js accepts PGN via .load_pgn() but we need to extract the final position
    const lines = pgn.split("\n");
    const movesLine = lines
      .filter((l) => !l.startsWith("[") && l.trim())
      .join(" ");
    // Try to apply moves sequentially
    const temp = new Chess();
    const moveTokens = movesLine
      .replace(/\{[^}]*\}/g, "")
      .replace(/\([^)]*\)/g, "")
      .replace(/\$\d+/g, "")
      .split(/\s+/)
      .filter((t) => t && !t.endsWith(".") && !/^\d+$/.test(t));
    for (const token of moveTokens) {
      try {
        temp.move(token);
      } catch {
        break;
      }
    }
    return temp;
  }

  const rawFen = typeof data.fen === "string" ? data.fen : undefined;
  if (rawFen) {
    const fen = normalizeFen(rawFen);
    const { ok, error } = validateFen(fen);
    // Diagrams don't always represent a legal, in-progress game (e.g. a single
    // piece to illustrate movement), so a missing king shouldn't be fatal.
    const missingKing = !ok && error?.includes("missing") && error?.includes("king");
    if (!ok && !missingKing) {
      throw new Error(`Invalid FEN: ${rawFen} (${error})`);
    }
    try {
      return newChess(fen);
    } catch {
      throw new Error(`Invalid FEN: ${rawFen}`);
    }
  }
  return newChess();
}

// Minimal YAML parser sufficient for chess blocks (avoids bundling js-yaml on client)
function normalizeFen(fen: string): string {
  const trimmed = fen.trim();
  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 1 && tokens.length < 6) {
    const defaults = ["w", "KQkq", "-", "0", "1"];
    for (let i = tokens.length; i < 6; i++) {
      tokens.push(defaults[i - 1] ?? "-");
    }
    return tokens.join(" ");
  }
  return trimmed;
}

function parseYamlLite(source: string): unknown {
  try {
    return loadYaml(source);
  } catch {
    // Fallback to custom parser
    return parseYamlLiteCustom(source);
  }
}

function parseYamlLiteCustom(source: string): unknown {
  const lines = source.split("\n");
  const out: Record<string, unknown> = {};
  let key: string | null = null;
  let valueLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^(\s*)(\w+):\s*(.*)$/);
    if (m) {
      if (key !== null) {
        out[key] = parseValue(valueLines.join("\n").trim());
      }
      key = m[2];
      valueLines = [m[3]];
    } else if (key !== null) {
      valueLines.push(line);
    }
  }
  if (key !== null) {
    out[key] = parseValue(valueLines.join("\n").trim());
  }

  return out;
}

function parseValue(v: string): unknown {
  if (v === "true" || v === "True") return true;
  if (v === "false" || v === "False") return false;
  if (v === "null" || v === "~") return null;
  if (/^-\s/.test(v)) {
    return v
      .split("\n")
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);
  }
  if (v.startsWith("[") && v.endsWith("]")) {
    try {
      return JSON.parse(v.replace(/'/g, '"'));
    } catch {
      return v;
    }
  }
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

// ---------------------------------------------------------------------------
// Color / arrow / highlight helpers
// ---------------------------------------------------------------------------

function resolveColors(
  blockData: Record<string, unknown>,
  fileConfig: Record<string, unknown>,
  globalConfig: Record<string, unknown>,
): BoardColors {
  const themeName = resolveTheme(blockData, fileConfig, globalConfig);

  const base = { ...(THEMES[themeName] ?? THEMES[DEFAULT_THEME]) };

  // Layer color overrides
  for (const cfg of [globalConfig, fileConfig, blockData]) {
    const colors = cfg.colors as Record<string, string> | undefined;
    if (colors) {
      if (colors.light_square) base.lightSquare = colors.light_square;
      if (colors.dark_square) base.darkSquare = colors.dark_square;
      if (colors.margin) base.margin = colors.margin;
      if (colors.coordinates) base.coord = colors.coordinates;
    }
  }

  return base;
}

/**
 * Resolve the effective chess theme name, honouring block -> file -> global
 * precedence and falling back to the default theme.
 */
function resolveTheme(
  blockData: Record<string, unknown>,
  fileConfig: Record<string, unknown>,
  globalConfig: Record<string, unknown>,
): string {
  return (
    (blockData.theme as string) ||
    (fileConfig.theme as string) ||
    (globalConfig.theme as string) ||
    DEFAULT_THEME
  );
}

function toCustomArrows(arrows: ArrowDef[]): Arrow[] {
  const COLORS: Record<string, string> = {
    green: "#15781b",
    red: "#cc0000",
    blue: "#003088",
    yellow: "#e68f00",
  };
  const out: Arrow[] = [];
  for (const a of arrows) {
    const from = (a.from ?? "").toLowerCase();
    const to = (a.to ?? "").toLowerCase();
    const color = COLORS[a.color ?? "green"] ?? COLORS.green;
    if (from && to) {
      out.push({ startSquare: from, endSquare: to, color });
    }
  }
  return out;
}

function buildSquareStyles(highlight?: string[]): Record<string, React.CSSProperties> {
  const styles: Record<string, React.CSSProperties> = {};
  if (!highlight) return styles;
  for (const sq of highlight) {
    styles[sq.toLowerCase()] = { backgroundColor: "rgba(246, 246, 105, 0.8)" };
  }
  return styles;
}
