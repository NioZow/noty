/**
 * Coloured terminal logger for the markdown-render rewrite.
 *
 * Port of the original Python `src/renderer/logging_utils.py`. Provides a
 * lightweight logger that prefixes messages with styled badges:
 *
 *   [+]  success / addition  (green)
 *   [*]  info / progress     (cyan)
 *   [-]  error / removal     (red)
 *   [!]  warning             (yellow)
 *
 * @example
 * import { getLogger } from "~/lib/logger";
 * const log = getLogger("sync");
 * log.info("Scanning notes directory...");
 * log.success("Found 42 challenges");
 * log.warning("Missing solve script for Foo");
 * log.error("Failed to parse README.md");
 *
 * @module logger
 */

/** ANSI escape codes used for badge colouring. */
const COLOUR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
} as const;

/**
 * Simple coloured logger mirroring the Python `Logger` class.
 *
 * Colour output is enabled only when stdout is attached to a TTY; when piped
 * or redirected, messages are printed without escape codes.
 */
export class Logger {
  /** Name of the subsystem this logger belongs to (kept for parity with the Python API). */
  readonly name: string;

  private readonly useColour: boolean;

  constructor(name: string = "markdown-render") {
    this.name = name;
    this.useColour = Boolean(process.stdout.isTTY);
  }

  /**
   * Format a message with a coloured badge prefix.
   *
   * @param badge - Badge text, e.g. `"[*]"`
   * @param colour - ANSI escape code from {@link COLOUR}
   * @param message - The message to print
   * @returns The formatted string (plain when colour is disabled)
   */
  private format(badge: string, colour: string, message: string): string {
    if (this.useColour) {
      return `${colour}${badge}${COLOUR.reset} ${message}`;
    }
    return `${badge} ${message}`;
  }

  /**
   * Print a success message prefixed with `[+]` (green).
   *
   * @param message - The message to print
   */
  success(message: string): void {
    console.log(this.format("[+]", COLOUR.green, message));
  }

  /**
   * Print an info message prefixed with `[*]` (cyan).
   *
   * @param message - The message to print
   */
  info(message: string): void {
    console.log(this.format("[*]", COLOUR.cyan, message));
  }

  /**
   * Print an error message prefixed with `[-]` (red) to stderr.
   *
   * @param message - The message to print
   */
  error(message: string): void {
    console.error(this.format("[-]", COLOUR.red, message));
  }

  /**
   * Print a warning message prefixed with `[!]` (yellow).
   *
   * @param message - The message to print
   */
  warning(message: string): void {
    console.log(this.format("[!]", COLOUR.yellow, message));
  }

  /**
   * Print a dim debug message (no badge, indented).
   *
   * @param message - The message to print
   */
  debug(message: string): void {
    if (this.useColour) {
      console.log(`${COLOUR.dim}    ${message}${COLOUR.reset}`);
    } else {
      console.log(`    ${message}`);
    }
  }
}

/**
 * Return a named logger instance.
 *
 * Mirrors the Python `get_logger(name)` factory.
 *
 * @param name - Name of the subsystem (e.g. `"challenge-sync"`)
 * @returns A new {@link Logger} instance
 */
export function getLogger(name: string = "markdown-render"): Logger {
  return new Logger(name);
}
