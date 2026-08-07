/**
 * API endpoint to lazily fetch children of a directory for the sidebar.
 *
 * Returns a flat list of NoteTreeEntry-like objects for the requested path.
 *
 * @module api/tree/route
 */

import { readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { notesDir } from "@/app/lib/config";
import { resolveNotePath } from "@/app/lib/file-resolver";

export const dynamic = "force-dynamic";

export interface TreeNode {
  name: string;
  url: string;
  is_dir: boolean;
  is_active: boolean;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path") ?? "";
  const currentPath = searchParams.get("current") ?? "";

  let dirPath: string;
  try {
    dirPath = await resolveNotePath(rawPath);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const root = path.resolve(notesDir());

  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    entries = [];
  }

  const items: TreeNode[] = [];
  for (const child of entries.sort()) {
    if (child.startsWith(".")) continue;
    const full = path.join(dirPath, child);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    const rel = path.relative(root, full).replace(/\\/g, "/") || "";
    const isActive =
      currentPath !== "" &&
      (currentPath === rel || currentPath.startsWith(rel + "/"));

    if (st.isDirectory()) {
      items.push({
        name: child,
        url: `/${rel}/`,
        is_dir: true,
        is_active: isActive,
      });
    } else if (path.extname(child).toLowerCase() === ".md") {
      items.push({
        name: path.basename(child, ".md"),
        url: `/${rel}`,
        is_dir: false,
        is_active: isActive,
      });
    }
  }

  return new Response(JSON.stringify(items), {
    headers: { "Content-Type": "application/json" },
  });
}
