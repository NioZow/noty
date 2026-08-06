/**
 * API endpoint returning a flat list of all notes for the Command Palette.
 *
 * @module api/all-notes/route
 */

import { readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { notesDir } from "@/app/lib/config";
import { FEAT_CMD_PALETTE } from "@/app/lib/features";

export const dynamic = "force-dynamic";

export interface FlatNote {
  name: string;
  url: string;
  isDir: boolean;
}

export async function GET(): Promise<Response> {
  if (!FEAT_CMD_PALETTE) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const root = path.resolve(notesDir());
  const items: FlatNote[] = [];

  function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const child of entries.sort()) {
      if (child.startsWith(".")) continue;
      const full = path.join(dir, child);
      let st;
      try {
        st = lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      const rel = path.relative(root, full).replace(/\\/g, "/") || "";
      if (st.isDirectory()) {
        items.push({ name: child, url: `/${rel}/`, isDir: true });
        walk(full);
      } else if (path.extname(child).toLowerCase() === ".md") {
        items.push({ name: path.basename(child, ".md"), url: `/${rel}`, isDir: false });
      }
    }
  }

  walk(root);
  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" },
  });
}
