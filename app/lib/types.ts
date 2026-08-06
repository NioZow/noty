/**
 * Shared types used across server and client boundaries.
 */

/** A single entry in the recursive note sidebar tree. */
export interface NoteTreeEntry {
  /** Display name (directory name or file stem). */
  name: string;
  /** Absolute-ish URL path (`/foo/bar/` or `/foo/bar.md`). */
  url: string;
  /** Whether this entry is a directory. */
  is_dir: boolean;
  /** Whether this entry or one of its descendants matches the current page. */
  is_active: boolean;
  /** Nesting depth (root = 0). */
  depth: number;
  /** Child entries (empty for files). */
  children: NoteTreeEntry[];
}
