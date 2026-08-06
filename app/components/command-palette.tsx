"use client";

import React from "react";

interface FlatNote {
  name: string;
  url: string;
  isDir: boolean;
}

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<FlatNote[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(false);
    fetch("/api/all-notes", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data: FlatNote[]) => {
        setItems(data);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items.slice(0, 20);
    return items
      .filter((i) => i.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [items, query]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left text-xs text-muted-foreground bg-muted rounded px-2 py-1.5 border border-border hover:border-ring transition-colors"
      >
        Search… <kbd className="ml-1 text-[10px]">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes…"
          className="w-full px-4 py-3 bg-transparent text-foreground outline-none border-b border-border"
        />
        <div className="max-h-96 overflow-y-auto p-2">
          {loading && (
            <div className="text-sm text-muted-foreground px-2 py-4 text-center">
              Loading…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive px-2 py-4 text-center">
              Failed to load notes.
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground px-2 py-4 text-center">
              No results.
            </div>
          )}
          <ul className="space-y-0.5">
            {filtered.map((item) => (
              <li key={item.url}>
                <a
                  href={item.url}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <span className="text-muted-foreground">
                    {item.isDir ? "📁" : "📄"}
                  </span>
                  <span className="truncate">{item.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
