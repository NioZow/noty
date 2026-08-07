/**
 * ReactMarkdown pipeline with GFM, KaTeX, chess boards, and callouts.
 *
 * Port of the original Python `parser.py` rendering logic to the React
 * component tree.  Uses `react-markdown` with the full remark/rehype plugin
 * chain and custom components for the renderer-specific plugins (chess,
 * callout, wiki-link, vuln-link, image-bg, template blocks).
 *
 * @module markdown-renderer
 */

"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import type { ReactNode } from "react";

import { ChessBoard } from "./chess-board";
import { Callout } from "./callout";

import "katex/dist/katex.min.css";

/**
 * Props accepted by {@link MarkdownRenderer}.
 */
export interface MarkdownRendererProps {
  /** Raw markdown source (frontmatter already stripped). */
  source: string;
  /** Optional chess_board config from file frontmatter. */
  chessConfig?: Record<string, unknown>;
  /** Optional document path for resolving relative links / images. */
  docPath?: string;
}

/**
 * Full-featured markdown renderer.
 *
 * Configures `react-markdown` with:
 * - `remark-gfm` — tables, strikethrough, task lists, etc.
 * - `remark-math` — `$...$` and `$$...$$` math syntax
 * - `rehype-katex` — server-side KaTeX rendering
 * - `rehype-raw` — allows raw HTML inside the markdown output
 *
 * Custom components map:
 * - `code` → Chess boards or syntax-highlighted code blocks
 * - `blockquote` → Callout boxes for `> [!KEYWORD]` syntax
 * - `a` → Wiki links, vuln links, and missing-link markers
 * - `img` → Images with optional background colour
 */
export function MarkdownRenderer({ source, chessConfig, docPath }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeRaw]}
      components={buildComponents({ chessConfig, docPath })}
    >
      {source}
    </ReactMarkdown>
  );
}

// ---------------------------------------------------------------------------
// Component mapping
// ---------------------------------------------------------------------------

interface ComponentCtx {
  chessConfig?: Record<string, unknown>;
  docPath?: string;
}

function buildComponents(ctx: ComponentCtx): Components {
  return {
    code(props) {
      const { className, children, inline, node, ...rest } = props;
      const match = /language-(\w+)/.exec(className ?? "");
      const lang = match?.[1] ?? "";
      const code = String(children ?? "").replace(/\n$/, "");
      const isFencedBlock = !!match;

      if (lang === "chess") {
        return <ChessBoard yamlSource={code} fileConfig={ctx.chessConfig} />;
      }

      if (lang === "mermaid") {
        return (
          <pre className="mermaid">
            <code {...rest} className={className}>
              {children}
            </code>
          </pre>
        );
      }

      if (!isFencedBlock) {
        return (
          <code {...rest} className={className}>
            {children}
          </code>
        );
      }

      return (
        <div className="code-block-wrapper">
          <div className="code-header">
            <span className="code-language">{lang || "text"}</span>
            <CopyButton text={code} />
          </div>
          <pre>
            <code {...rest} className={className}>
              {children}
            </code>
          </pre>
        </div>
      );
    },

    blockquote(props) {
      const callout = parseCalloutFromChildren(props.children);
      if (callout) {
        return (
          <Callout keyword={callout.keyword} title={callout.title}>
            {callout.body}
          </Callout>
        );
      }
      return <blockquote {...props} />;
    },

    a(props) {
      const { children, href, className, ...rest } = props;
      if (!href) return <a {...props} />;

      // Wiki-link syntax: [[Note Name]] is turned into <a data-wiki="target">display</a>
      // by a remark plugin or pre-processing step.
      if ((rest as Record<string, unknown>)["data-wiki"]) {
        return (
          <a href={href} className={cn("wiki-link", className)} {...rest}>
            {children}
          </a>
        );
      }

      // Missing wiki-link marker
      if ((rest as Record<string, unknown>)["data-wiki-missing"]) {
        return (
          <span className={cn("wiki-link-missing", className)} {...rest}>
            {children}
          </span>
        );
      }

      // Vulnerability link: #[text](slug)
      if ((rest as Record<string, unknown>)["data-vuln"]) {
        return (
          <a href={href} className={cn("vuln-link", className)} {...rest}>
            <span className="vuln-link-icon">&#x1F41B;</span>
            <span className="vuln-link-text">{children}</span>
          </a>
        );
      }

      // Missing vulnerability link
      if ((rest as Record<string, unknown>)["data-vuln-missing"]) {
        return (
          <span className={cn("vuln-link-missing", className)} {...rest}>
            <span className="vuln-link-icon">&#x1F41B;</span>
            <span className="vuln-link-text">{children}</span>
          </span>
        );
      }

      // Image with background colour: ![alt](url #RRGGBB) rendered as figure wrapper
      if ((rest as Record<string, unknown>)["data-image-bg"]) {
        const color = String((rest as Record<string, unknown>)["data-image-bg"]);
        return (
          <figure className="md-image">
            <div className="md-image-bg" style={{ backgroundColor: color }}>
              <a href={href} {...rest}>
                {children}
              </a>
            </div>
          </figure>
        );
      }

      // Local file missing marker (injected as data-missing="true")
      if ((rest as Record<string, unknown>)["data-missing"] === "true") {
        return (
          <a href={href} className={cn("link-missing", className)} {...rest}>
            {children}
          </a>
        );
      }

      // Rewrite README.md links → parent directory (mirrors Python)
      const rewritten = rewriteReadmeLink(href);
      if (rewritten !== href) {
        return (
          <a href={rewritten} className={className} {...rest}>
            {children}
          </a>
        );
      }

      return <a href={href} className={className} {...rest}>{children}</a>;
    },

    // eslint-disable-next-line @next/next/no-img-element
    img(props) {
      const { src, alt, className, ...rest } = props;
      const color = (rest as Record<string, unknown>)["data-bg"] as string | undefined;
      if (color) {
        return (
          <div className="md-image-bg" style={{ backgroundColor: color }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} {...rest} className={className} loading="lazy" />
          </div>
        );
      }
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={alt} {...rest} className={className} loading="lazy" />;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Matches `[!KEYWORD]`, `[!KEYWORD] Title`, or `[!KEYWORD]\nrest of paragraph`. */
const CALLOUT_RE = /^\[!([A-Za-z0-9_]+)\]([^\n]*)\n?([\s\S]*)$/;

/**
 * Try to parse a callout from a blockquote's rendered children.
 *
 * Matches GFM blockquotes whose first paragraph starts with `[!KEYWORD]` or
 * `[!KEYWORD] Title`, mirroring GitHub's alert syntax. Operates on the actual
 * React node tree (rather than a flattened string) so that formatting inside
 * the callout body — bold, code, links, subsequent paragraphs/lists — survives
 * intact instead of being collapsed to plain text.
 */
function parseCalloutFromChildren(
  children: ReactNode,
): { keyword: string; title?: string; body: ReactNode } | null {
  const items = React.Children.toArray(children);
  const firstIdx = items.findIndex((c) => !(typeof c === "string" && c.trim() === ""));
  const first = items[firstIdx];
  if (firstIdx === -1 || !React.isValidElement(first) || first.type !== "p") return null;

  const pProps = first.props as { children?: ReactNode };
  const pItems = React.Children.toArray(pProps.children);
  const textIdx = pItems.findIndex((c) => typeof c === "string" && c.trim() !== "");
  if (textIdx === -1) return null;

  const match = CALLOUT_RE.exec((pItems[textIdx] as string).replace(/^\s+/, ""));
  if (!match) return null;

  const keyword = match[1].toUpperCase();
  const title = match[2].trim() || undefined;
  const restOfParagraph = match[3];

  const newPItems = [...pItems];
  if (restOfParagraph) {
    newPItems[textIdx] = restOfParagraph;
  } else {
    newPItems.splice(textIdx, 1);
  }

  const bodyItems = [...items];
  if (newPItems.length === 0) {
    bodyItems.splice(firstIdx, 1);
  } else {
    bodyItems[firstIdx] = React.cloneElement(first, undefined, ...newPItems);
  }

  return { keyword, title, body: bodyItems.length > 0 ? bodyItems : undefined };
}

/**
 * Rewrite `README.md` links to point to the parent directory.
 */
function rewriteReadmeLink(href: string): string {
  if (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("//") ||
    href.startsWith("#")
  ) {
    return href;
  }

  const decoded = decodeURIComponent(href);
  const pathPart = decoded.split("#")[0];
  const lower = pathPart.toLowerCase();
  if (!lower.endsWith("readme.md")) return href;

  const fragment = decoded.includes("#") ? "#" + decoded.split("#", 2)[1] : "";
  const idx = lower.lastIndexOf("readme.md");
  let prefix = decoded.slice(0, idx);
  if (prefix === "") prefix = "./";
  else if (!prefix.endsWith("/")) prefix += "/";
  return prefix + fragment;
}

/**
 * Simple copy-to-clipboard button for code blocks.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const onClick = React.useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      className="copy-button"
      onClick={onClick}
      aria-label="Copy code"
      type="button"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      <span>{copied ? "Copied!" : "Copy"}</span>
    </button>
  );
}
