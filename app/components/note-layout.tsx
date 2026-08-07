"use client";

import React from "react";
import Link from "next/link";
import { Folder, FolderOpen, FileText } from "lucide-react";
import type { NoteTreeEntry } from "@/app/lib/types";
import CommandPalette from "@/app/components/command-palette";

export interface NoteLayoutProps {
  /** Sidebar tree entries (root-level only, lazily expanded). */
  entries: NoteTreeEntry[];
  /** Main content area. */
  children: React.ReactNode;
}

/**
 * Two-column layout: lazily-loaded note tree on the left, content on the right.
 *
 * Only the root folder entries mount initially.  Every folder fetches its
 * children via `/api/tree?path=` on first expand.
 */
export function NoteLayout({ entries, children }: NoteLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside
        className="w-72 shrink-0 overflow-y-auto hidden md:flex md:flex-col gap-6 p-5"
        style={{
          background: "var(--mr-surface)",
          borderRight: "1px solid var(--mr-border)",
        }}
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
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <main
        className="flex-1 min-w-0 p-6 lg:p-10"
        style={{ maxWidth: "calc(100vw - 288px)" }}
      >
        <div style={{ maxWidth: "var(--mr-max-width)", margin: "0 auto" }}>
          {children}
        </div>
      </main>
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
