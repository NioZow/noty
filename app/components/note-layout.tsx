"use client";

import React from "react";
import Link from "next/link";
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
      <aside className="w-72 shrink-0 border-r border-border bg-muted/30 overflow-y-auto p-4 hidden md:flex md:flex-col gap-4">
        <div>
          <Link
            href="/"
            className="block font-semibold text-foreground hover:text-primary"
          >
            Notes
          </Link>
        </div>
        <CommandPalette />
        <nav className="flex-1 overflow-y-auto">
          <NoteTree entries={entries} />
        </nav>
        <div className="mt-auto pt-4 border-t border-border space-y-1">
          <SidebarLink href="/challenges">Challenges</SidebarLink>
          <SidebarLink href="/vulnerabilities">Vulnerabilities</SidebarLink>
          <SidebarLink href="/tags">Tags</SidebarLink>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 lg:p-10 max-w-4xl mx-auto">
        {children}
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
      className="block text-sm text-muted-foreground hover:text-primary transition-colors"
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
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Toggle"
          >
            <ChevronIcon open={open} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <a
          href={entry.url}
          className={`text-sm truncate ${
            entry.is_active
              ? "text-primary font-medium"
              : "text-foreground hover:text-primary"
          }`}
          title={entry.name}
        >
          {entry.is_dir ? "📁 " : "📄 "}
          {entry.name}
        </a>
      </div>
      {open && children !== null && children.length > 0 && (
        <div className="pl-4 mt-0.5">
          <NoteTree entries={children} />
        </div>
      )}
      {open && loading && (
        <div className="pl-4 mt-0.5 text-xs text-muted-foreground">
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
