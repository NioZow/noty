"use client";

import * as React from "react";
import { Flag, Search, Terminal, X } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";

export interface ChallengeData {
  id: number;
  name: string;
  platform: string;
  tldr: string;
  category: string;
  readmePath: string;
  tags: { id: number; name: string }[];
  solveScripts: { id: number; language: string }[];
}

export function ChallengeGrid({ challenges }: { challenges: ChallengeData[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return challenges;
    return challenges.filter((c) => {
      const haystack = [c.name, c.tldr, c.platform, c.category, ...c.tags.map((t) => t.name)]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [challenges, query]);

  return (
    <div>
      <div className="relative mb-6">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, platform, category, or tag…"
          className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {filtered.length === challenges.length
          ? `${challenges.length} challenge${challenges.length === 1 ? "" : "s"}`
          : `${filtered.length} of ${challenges.length} challenges`}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No challenges match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((c) => (
            <a
              key={c.id}
              href={`/${c.readmePath}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Flag size={16} className="shrink-0 text-primary" />
                  <h3 className="truncate text-[0.95rem] font-semibold text-foreground transition-colors group-hover:text-primary">
                    {c.name}
                  </h3>
                </div>
                {c.category ? (
                  <Badge variant="outline" className="shrink-0 text-[0.65rem] uppercase tracking-wide">
                    {c.category}
                  </Badge>
                ) : null}
              </div>

              {c.tldr ? (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{c.tldr}</p>
              ) : null}

              <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.platform ? (
                    <Badge variant="secondary" className="text-[0.7rem]">
                      {c.platform}
                    </Badge>
                  ) : null}
                  {c.tags.map((t) => (
                    <Badge key={t.id} variant="secondary" className="text-[0.7rem]">
                      {t.name}
                    </Badge>
                  ))}
                </div>
                {c.solveScripts.length > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[0.7rem] text-muted-foreground">
                    <Terminal size={12} />
                    {c.solveScripts.length} script{c.solveScripts.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
