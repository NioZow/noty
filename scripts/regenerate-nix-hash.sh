#!/usr/bin/env bash
#
# Recompute the `nodeModulesHashes.<system>` entry for the CURRENT machine and
# write it back into flake.nix.
#
# bun installs platform-specific optional deps (@next/swc-*, @img/sharp-*,
# @tailwindcss/oxide-*), so each OS/arch has a distinct fixed-output hash. Run
# this after `bun install` updates bun.lock, or on a machine that isn't listed
# under `nodeModulesHashes` yet.
#
# Portable across GNU (Linux) and BSD (macOS) sed/awk: uses `-i.bak` for in
# place edits (required by BSD sed) and POSIX awk for hash extraction.
set -euo pipefail

cd "$(dirname "$0")/.."

# `nix eval --raw` prints the target to stdout; trim any stray whitespace so it
# can be used as a plain Nix identifier.
system="$(nix eval --raw nixpkgs#system)"
system="$(printf '%s\n' "$system" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
echo "detected system: ${system}"

# The attrset key is a bare (unquoted) Nix identifier like `aarch64-linux` and
# its value is either a quoted hash or the unquoted placeholder `lib.fakeHash`,
# possibly followed by a trailing `# ...` comment.

# 1. point this system's hash at a placeholder so nix rebuilds and reports the
#    real hash instead of aborting on a mismatch. Matches a quoted value.
sed -i.bak "s|\(^[[:space:]]*${system}[[:space:]]*=[[:space:]]*\)\"[^\"]*\";|\1lib.fakeHash;|" flake.nix
rm -f flake.nix.bak

# 2. build; the fixed-output derivation fails but prints `got: sha256-...`.
set +e
out="$(nix build --no-link 2>&1)"
status=$?
set -e
if [ "$status" -ne 0 ]; then
    got="$(printf '%s\n' "$out" | awk '/got:/{for (i=1; i<=NF; i++) if ($i ~ /^sha256-/) { print $i; exit }}')"
else
    got=""
fi

if [ -z "$got" ]; then
    printf '%s\n' "$out" >&2
    echo "ERROR: could not obtain a 'got:' hash for ${system}" >&2
    exit 1
fi

# 3. write the real hash back: replace the bare `lib.fakeHash;` placeholder,
#    preserving any trailing `# ...` comment on the line.
sed -i.bak "s|\(^[[:space:]]*${system}[[:space:]]*=[[:space:]]*\)lib\.fakeHash;|\1\"${got}\";|" flake.nix
rm -f flake.nix.bak
echo "updated flake.nix: \"${system}\" = \"${got}\""

nix build --no-link
echo "OK: nix build"