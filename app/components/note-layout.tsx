"use client";

import React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Folder, FolderOpen, FileText } from "lucide-react";
import type { NoteTreeEntry } from "@/app/lib/types";
import CommandPalette from "@/app/components/command-palette";

export interface NoteLayoutProps {
  /** Sidebar tree entries (root-level only, lazily expanded). */
  entries: NoteTreeEntry[];
  /** Main content area. */
  children: React.ReactNode;
}

const SIDEBAR_WIDTH = 288; // px, matches w-72
const SIDEBAR_COLLAPSED_KEY = "mr-sidebar-collapsed";

/**
 * Find the expand button of the mermaid diagram vertically closest to the
 * viewport center, so Ctrl+F expands whichever diagram the user is looking
 * at rather than always the first one on the page.
 */
function closestMermaidExpandButton(): HTMLButtonElement | null {
  const wrappers = document.querySelectorAll<HTMLElement>(".mermaid-wrapper");
  if (wrappers.length === 0) return null;

  const viewportCenter = window.innerHeight / 2;
  let closest: HTMLElement | null = null;
  let closestDist = Infinity;
  for (const wrapper of wrappers) {
    const rect = wrapper.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - viewportCenter);
    if (dist < closestDist) {
      closestDist = dist;
      closest = wrapper;
    }
  }

  return closest?.querySelector<HTMLButtonElement>(".mermaid-expand-btn") ?? null;
}

/**
 * Two-column layout: lazily-loaded note tree on the right, content on the left.
 *
 * Only the root folder entries mount initially.  Every folder fetches its
 * children via `/api/tree?path=` on first expand.  The sidebar can be
 * folded away via the toggle button on its edge; the collapsed state is
 * remembered across page loads.
 */
export function NoteLayout({ entries, children }: NoteLayoutProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleCollapsed();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        const expandBtn = closestMermaidExpandButton();
        if (expandBtn) {
          e.preventDefault();
          expandBtn.click();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [toggleCollapsed]);

  return (
    <div className="flex min-h-screen">
      {/* ── Main ──────────────────────────────────────────────────────── */}
      <main
        className="flex-1 min-w-0 p-6 lg:p-10"
        style={{ maxWidth: `calc(100vw - ${collapsed ? 0 : SIDEBAR_WIDTH}px)` }}
      >
        <div
          style={{
            maxWidth: "var(--mr-max-width)",
            marginLeft: "max(0px, calc((100vw - var(--mr-max-width)) / 2))",
          }}
        >
          {children}
        </div>
      </main>

      {/* ── Sidebar fold toggle ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
        title={`${collapsed ? "Show" : "Hide"} sidebar (⌘E)`}
        className="hidden md:flex fixed top-1/2 z-10 h-8 w-5 items-center justify-center rounded-l transition-[right] duration-200"
        style={{
          right: collapsed ? 0 : SIDEBAR_WIDTH,
          transform: "translateY(-50%)",
          background: "var(--mr-surface)",
          border: "1px solid var(--mr-border)",
          borderRight: "none",
          color: "var(--mr-subtext)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--mr-accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--mr-subtext)")}
      >
        {collapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside
        className="shrink-0 hidden md:block overflow-hidden sticky top-0 self-start transition-[width] duration-200"
        style={{
          width: collapsed ? 0 : SIDEBAR_WIDTH,
          height: "100vh",
          background: "var(--mr-surface)",
          borderLeft: collapsed ? "none" : "1px solid var(--mr-border)",
        }}
      >
        <div
          className="flex flex-col gap-6 p-5 h-full overflow-y-auto"
          style={{ width: SIDEBAR_WIDTH }}
        >
          <div>
            <Link
              href="/"
              className="sidebar-brand"
              style={{ color: "var(--mr-text)" }}
            >
              Notes
            </Link>
          </div>

          <CommandPalette />

          <nav className="flex-1 overflow-y-auto">
            <NoteTree entries={entries} />
          </nav>

          <div
            className="mt-auto pt-4 space-y-1"
            style={{ borderTop: "1px solid var(--mr-border)" }}
          >
            <SidebarLink href="/challenges">Challenges</SidebarLink>
            <SidebarLink href="/vulnerabilities">Vulnerabilities</SidebarLink>
            <SidebarLink href="/tags">Tags</SidebarLink>
          </div>
        </div>
      </aside>
    </div>
  );
}

function SidebarLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block text-sm transition-colors"
      style={{
        color: "var(--mr-subtext)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.78rem",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget.style.color = "var(--mr-accent)"))
      }
      onMouseLeave={(e) =>
        ((e.currentTarget.style.color = "var(--mr-subtext)"))
      }
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Lazy tree
// ---------------------------------------------------------------------------

function NoteTree({ entries }: { entries: NoteTreeEntry[] }) {
  return (
    <ul className="space-y-0.5">
      {entries.map((e) => (
        <TreeItem key={e.url} entry={e} />
      ))}
    </ul>
  );
}

function TreeItem({ entry }: { entry: NoteTreeEntry }) {
  const [children, setChildren] = React.useState<NoteTreeEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(entry.is_active);

  const hasChildren =
    entry.is_dir && (children === null || children.length > 0);

  const toggle = React.useCallback(() => {
    if (!entry.is_dir) return;
    setOpen((prev) => {
      const next = !prev;
      if (next && children === null && !loading) {
        setLoading(true);
        const rel = entry.url.replace(/^\//, "").replace(/\/$/, "");
        fetch(`/api/tree?path=${encodeURIComponent(rel)}`, {
          cache: "no-store",
        })
          .then((r) => r.json())
          .then((data: { name: string; url: string; is_dir: boolean }[]) => {
            setChildren(
              data.map((d) => ({
                name: d.name,
                url: d.url,
                is_dir: d.is_dir,
                is_active: false,
                depth: entry.depth + 1,
                children: [],
              })),
            );
          })
          .catch(() => setChildren([]))
          .finally(() => setLoading(false));
      }
      return next;
    });
  }, [entry, children, loading]);

  return (
    <li className="select-none">
      <div className="flex items-center gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={toggle}
            className="w-4 h-4 flex items-center justify-center transition-colors"
            style={{ color: "var(--mr-subtext)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget.style.color = "var(--mr-text)"))
            }
            onMouseLeave={(e) =>
              ((e.currentTarget.style.color = "var(--mr-subtext)"))
            }
            aria-label="Toggle"
          >
            <ChevronIcon open={open} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <a
          href={entry.url}
          className="text-sm truncate flex items-center gap-1.5"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8125rem",
            color: entry.is_active ? "var(--mr-accent)" : "var(--mr-text)",
          }}
          onMouseEnter={(e) => {
            if (!entry.is_active) {
              e.currentTarget.style.color = "var(--mr-accent)";
            }
          }}
          onMouseLeave={(e) => {
            if (!entry.is_active) {
              e.currentTarget.style.color = "var(--mr-text)";
            }
          }}
          title={entry.name}
        >
          {entry.is_dir ? (
            open ? (
              <FolderOpen
                size={14}
                style={{ opacity: 0.6, flexShrink: 0 }}
                strokeWidth={1.8}
              />
            ) : (
              <Folder
                size={14}
                style={{ opacity: 0.5, flexShrink: 0 }}
                strokeWidth={1.8}
              />
            )
          ) : (
            <FileText
              size={14}
              style={{ opacity: 0.4, flexShrink: 0 }}
              strokeWidth={1.8}
            />
          )}
          {entry.name}
        </a>
      </div>
      {open && children !== null && children.length > 0 && (
        <div className="pl-4 mt-0.5">
          <NoteTree entries={children} />
        </div>
      )}
      {open && loading && (
        <div
          className="pl-4 mt-0.5"
          style={{
            color: "var(--mr-subtext)",
            fontSize: "0.6875rem",
            fontFamily: "var(--font-mono)",
          }}
        >
          Loading…
        </div>
      )}
    </li>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 1L7 5L3 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
