/**
 * Callout / alert box component for `> [!KEYWORD]` blockquotes.
 *
 * Port of the original Python parser's callout rendering logic from
 * `parser.py`.  Maps keywords to icon + CSS class and renders a styled
 * box with a label and body.
 *
 * @module callout
 */

import React from "react";

// ---------------------------------------------------------------------------
// Keyword → (icon, css-class)
// ---------------------------------------------------------------------------

const CALLOUT_DEFS: Record<string, [string, string]> = {
  FIX: ["🐛", "callout-error"],
  FIXME: ["🐛", "callout-error"],
  FIXIT: ["🐛", "callout-error"],
  ISSUE: ["🐛", "callout-error"],
  TODO: ["✅", "callout-info"],
  HACK: ["⚡", "callout-warning"],
  WARN: ["⚠️", "callout-warning"],
  WARNING: ["⚠️", "callout-warning"],
  IMPORTANT: ["⚠️", "callout-warning"],
  PERF: ["🚀", "callout-perf"],
  OPTIM: ["🚀", "callout-perf"],
  PERFORMANCE: ["🚀", "callout-perf"],
  OPTIMIZE: ["🚀", "callout-perf"],
  VULNERABILITY: ["💀", "callout-vuln"],
  VULN: ["🛡️", "callout-vuln"],
  BUG: ["🛡️", "callout-vuln"],
  EXPLOIT: ["🛡️", "callout-vuln"],
  SPLOIT: ["🛡️", "callout-vuln"],
  NOTE: ["📝", "callout-hint"],
  INFO: ["📝", "callout-hint"],
  TEST: ["🧪", "callout-test"],
  TESTING: ["🧪", "callout-test"],
  PASSED: ["🧪", "callout-test"],
  FAILED: ["🧪", "callout-test"],
  TIP: ["💡", "callout-hint"],
  IDEA: ["💡", "callout-hint"],
  SMART: ["💡", "callout-hint"],
  SAFETY: ["🔒", "callout-hint"],
  SAFE: ["🔒", "callout-hint"],
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CalloutProps {
  /** The uppercase keyword (e.g. "NOTE", "WARN"). */
  keyword: string;
  /** Optional inline title after the keyword (e.g. vulnerability name). */
  title?: string;
  /** Body content (already rendered as markdown HTML or plain text). */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render a callout box for a `> [!KEYWORD]` blockquote.
 */
export function Callout({ keyword, title, children }: CalloutProps) {
  const defn = CALLOUT_DEFS[keyword];
  if (!defn) {
    // Unknown keyword — fall back to a plain blockquote
    return <blockquote>{children}</blockquote>;
  }

  const [icon, cssClass] = defn;

  // VULNERABILITY callout with a title is rendered as a link when the server
  // has resolved it.  We accept either a plain string title or JSX that may
  // already be a link.
  const isVuln = keyword === "VULNERABILITY";

  return (
    <div className={`callout ${cssClass}`}>
      <div className="callout-label">
        <span className="callout-icon" aria-hidden="true">
          {icon}
        </span>
        <strong className="callout-title">
          {keyword}
          {title ? (
            <>
              {isVuln ? ": " : ": "}
              {isVuln && typeof title === "string" ? (
                <span className="vuln-title-link">{title}</span>
              ) : (
                title
              )}
            </>
          ) : null}
        </strong>
      </div>
      {children && <div className="callout-body">{children}</div>}
    </div>
  );
}
