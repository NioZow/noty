/**
 * Utilities for file type detection and text file handling.
 *
 * Port of the original Python `src/renderer/file_utils.py` to async
 * TypeScript (`fs/promises`). Binary detection keeps the exact same
 * heuristics: magic-number signatures (with the offset-4 prefix check),
 * null-byte detection, and a non-printable-character ratio threshold.
 *
 * @module file-utils
 */

import { open, readFile } from "node:fs/promises";
import path from "node:path";

/** Number of leading bytes inspected by {@link isBinaryFile}. */
const READ_CHUNK_SIZE = 8192;

/** Offset at which some signatures (e.g. MP4 `ftyp`) may appear. */
const SIGNATURE_OFFSET = 4;

/** Above this ratio of non-text bytes a file is considered binary. */
const NON_TEXT_RATIO_THRESHOLD = 0.3;

/** Common text file extensions that are always treated as text. */
export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".htm", ".css", ".scss",
  ".sass", ".less", ".json", ".xml", ".yaml", ".yml", ".toml", ".ini",
  ".cfg", ".conf", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
  ".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".hxx", ".rs", ".go", ".java",
  ".kt", ".scala", ".clj", ".rb", ".php", ".pl", ".pm", ".lua", ".vim",
  ".el", ".swift", ".m", ".mm", ".r", ".rmd", ".sql", ".md", ".markdown",
  ".txt", ".rst", ".tex", ".dockerfile", ".gitignore", ".gitattributes",
  ".editorconfig", ".lock", ".sum", ".mod", ".gradle", ".sbt", ".vue",
  ".svelte", ".astro", ".graphql", ".gql", ".proto", ".thrift", ".cmake",
  ".make", ".mk", ".dockerignore", ".env", ".envrc", ".nvmrc",
  ".python-version", ".gitmodules", ".mailmap", ".codecov", ".travis.yml",
  ".eslintrc", ".prettierrc", ".babelrc", ".postcssrc", ".htaccess",
  ".nginx", ".apache", ".log", ".csv", ".tsv", ".svg", ".diff", ".patch",
]);

/** Mapping of file extensions to highlight.js language identifiers. */
export const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".jsx": "javascript",
  ".tsx": "typescript",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "scss",
  ".less": "less",
  ".json": "json",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".ini": "ini",
  ".cfg": "ini",
  ".conf": "ini",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".fish": "fish",
  ".ps1": "powershell",
  ".bat": "dos",
  ".cmd": "dos",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".scala": "scala",
  ".clj": "clojure",
  ".rb": "ruby",
  ".php": "php",
  ".pl": "perl",
  ".pm": "perl",
  ".lua": "lua",
  ".vim": "vim",
  ".el": "elisp",
  ".swift": "swift",
  ".m": "objectivec",
  ".mm": "objectivec",
  ".r": "r",
  ".sql": "sql",
  ".md": "markdown",
  ".markdown": "markdown",
  ".tex": "latex",
  ".dockerfile": "dockerfile",
  ".vue": "vue",
  ".svelte": "svelte",
  ".graphql": "graphql",
  ".gql": "graphql",
  ".proto": "protobuf",
  ".cmake": "cmake",
  ".make": "makefile",
  ".mk": "makefile",
  ".diff": "diff",
  ".patch": "diff",
  ".csv": "csv",
  ".tsv": "csv",
  ".svg": "xml",
  ".log": "plaintext",
  ".txt": "plaintext",
};

/**
 * Binary file signatures (magic numbers) for common binary formats.
 *
 * Encoded with latin1 so each character maps to exactly one byte, preserving
 * the byte values from the Python `bytes` literals one-to-one.
 */
export const BINARY_SIGNATURES: readonly Buffer[] = [
  Buffer.from("\x89PNG", "latin1"), // PNG
  Buffer.from("\xff\xd8\xff", "latin1"), // JPEG
  Buffer.from("GIF87a", "latin1"), // GIF
  Buffer.from("GIF89a", "latin1"), // GIF
  Buffer.from("PK\x03\x04", "latin1"), // ZIP (includes docx, xlsx, etc.)
  Buffer.from("Rar!", "latin1"), // RAR
  Buffer.from("\x1f\x8b", "latin1"), // GZIP
  Buffer.from("BZh", "latin1"), // BZIP2
  Buffer.from("\xfd7zXZ", "latin1"), // XZ
  Buffer.from("7z\xbc\xaf", "latin1"), // 7z
  Buffer.from("\xca\xfe\xba\xbe", "latin1"), // Mach-O / Java class
  Buffer.from("MZ", "latin1"), // Windows executable
  Buffer.from("\x7fELF", "latin1"), // ELF executable
  Buffer.from("%PDF", "latin1"), // PDF
  Buffer.from("\x00\x00\x01\x00", "latin1"), // ICO
  Buffer.from("\x00\x00\x02\x00", "latin1"), // CUR
  Buffer.from("BM", "latin1"), // BMP
  Buffer.from("II*\x00", "latin1"), // TIFF little-endian
  Buffer.from("MM\x00*", "latin1"), // TIFF big-endian
  Buffer.from("fLaC", "latin1"), // FLAC
  Buffer.from("ID3", "latin1"), // MP3 with ID3 tag
  Buffer.from("\xff\xfb", "latin1"), // MP3 without ID3
  Buffer.from("\xff\xf3", "latin1"), // MP3 without ID3
  Buffer.from("\xff\xf2", "latin1"), // MP3 without ID3
  Buffer.from("RIFF", "latin1"), // WAV, AVI, WEBP
  Buffer.from("OggS", "latin1"), // OGG
  Buffer.from("\x1aE\xdf\xa3", "latin1"), // MKV / WebM
  Buffer.from("ftyp", "latin1"), // MP4 (offset 4)
  Buffer.from("\x00\x00\x00 ftyp", "latin1"), // MP4
  Buffer.from("\x00\x00\x00\x18ftyp", "latin1"), // MP4
  Buffer.from("\x00\x00\x00\x14ftyp", "latin1"), // MP4
];

/**
 * Byte values considered "text".
 *
 * Matches the Python definition:
 * `{7, 8, 9, 10, 12, 13, 27} | (range(0x20, 0x100) - {0x7F})` — i.e. common
 * control characters (bell, backspace, tab, LF, FF, CR, escape) plus all
 * bytes from space up to 0xFF except DEL.
 */
const TEXT_CHAR_BYTES: ReadonlySet<number> = (() => {
  const textBytes = new Set<number>([7, 8, 9, 10, 12, 13, 27]);
  for (let byte = 0x20; byte <= 0xff; byte++) {
    if (byte !== 0x7f) {
      textBytes.add(byte);
    }
  }
  return textBytes;
})();

/**
 * Check whether a file is binary by examining its content.
 *
 * Reads the first {@link READ_CHUNK_SIZE} bytes and checks for null bytes or
 * a high ratio of non-printable characters, as well as common binary file
 * signatures (magic numbers). Mirrors the Python `is_binary_file()`.
 *
 * Time Complexity: O(n) where n is the number of bytes read (max 8192)
 * Space Complexity: O(1) besides the fixed-size chunk buffer
 *
 * @param filePath - Path to the file to check
 * @returns True if the file appears to be binary (or cannot be read),
 *   false otherwise
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  let chunk: Buffer;
  try {
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(READ_CHUNK_SIZE);
      const { bytesRead } = await handle.read(buffer, 0, READ_CHUNK_SIZE, 0);
      chunk = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    // Mirrors Python: unreadable files are treated as binary.
    return true;
  }

  if (chunk.length === 0) {
    return false; // empty files are text
  }

  // check for null bytes — definitive sign of binary
  if (chunk.includes(0)) {
    return true;
  }

  // check for common binary file signatures
  for (const signature of BINARY_SIGNATURES) {
    if (chunk.subarray(0, signature.length).equals(signature)) {
      return true;
    }
    // some signatures appear at an offset (e.g. MP4's `ftyp` at offset 4)
    if (
      chunk.length > signature.length + SIGNATURE_OFFSET &&
      chunk
        .subarray(SIGNATURE_OFFSET, SIGNATURE_OFFSET + signature.length)
        .equals(signature)
    ) {
      return true;
    }
  }

  // text files should mostly contain printable ASCII, tabs, newlines
  let nonTextCount = 0;
  for (const byte of chunk) {
    if (!TEXT_CHAR_BYTES.has(byte)) {
      nonTextCount++;
    }
  }

  // if more than 30% non-printable, consider it binary
  return nonTextCount / chunk.length > NON_TEXT_RATIO_THRESHOLD;
}

/**
 * Get the highlight.js language identifier for a given file.
 *
 * @param filePath - Path to the file
 * @returns The language identifier, or `"plaintext"` if unknown
 */
export function getLanguageForFile(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[extension] ?? "plaintext";
}

/**
 * Check whether a file should be treated as text.
 *
 * Combines the extension check with binary content detection: known text
 * extensions are trusted first, then binary detection is used as a fallback
 * for unknown extensions. Mirrors the Python `is_text_file()`.
 *
 * @param filePath - Path to the file
 * @returns True if the file should be treated as text
 */
export async function isTextFile(filePath: string): Promise<boolean> {
  // first check known text extensions
  const extension = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  // then check if it's binary
  if (await isBinaryFile(filePath)) {
    return false;
  }

  // if not binary and has a reasonable size, treat as text
  return true;
}

/**
 * Read a text file and return its contents as a string.
 *
 * Node's UTF-8 decoding replaces invalid byte sequences with U+FFFD, which
 * matches the Python `errors="replace"` behaviour: the file can always be
 * read without raising decode errors.
 *
 * @param filePath - Path to the text file
 * @returns The file contents as a string
 * @throws {@link NodeJS.ErrnoException} If the file cannot be read
 */
export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}
