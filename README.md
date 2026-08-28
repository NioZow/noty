# Noty

A markdown note viewer that renders your notes, chess diagrams, math and CTF
challenge write-ups in the browser.

## Features

- **Markdown notes** — renders a folder of `.md` files with a sidebar tree,
  backlinks and full-text navigation.
- **Chess diagrams** — renders `chess.js`-embedded positions from ` ```chess `
blocks with a choice of board themes.
- **Math** — KaTeX rendering via `remark-math` / `rehype-katex`.
- **Mermaid diagrams** — rendered client-side and serialized to SVG.
- **CTF challenges & vulnerabilities** — a SQLite-backed store (Prisma) that
  indexes write-ups from a configured challenges root, with tag browsing.
- **Template support** — user-defined templates are picked up from a note's
  folder.
- **MCP server** — optional Model Context Protocol integration exposing notes
  as tools to AI agents.

## Installation

### bun (local development)

Requires [bun](https://bun.sh) and a Prisma-compatible toolchain.

```sh
bun install
bun run dev
```

Then open http://localhost:3000. By default noty reads notes from
`$HOME/notes` and a config file at `~/.config/markdown-render/config.yml`.

Build and run in production:

```sh
bun run build
DATABASE_URL="file:$HOME/.cache/markdown-render/challenges.db" bun run start
```

### Docker

A multi-stage `Dockerfile` builds the app and launches it under V8 on
`oven/bun`. Mount your notes into the `/notes` volume.

```sh
docker build -t noty .
docker run --rm -p 3000:3000 \
  -v "$HOME/notes:/notes" \
  -e NOTES_DIR=/notes \
  noty
```

The image exposes port `3000` and by default initialises the challenges
database at `/root/.cache/markdown-render/challenges.db`.

### Nix

The repository is a flake. It provides:
- `packages.<system>.default` — the runnable `noty` package,
- `apps.<system>.default` / `nix run` — runs the server,
- `devShells.<system>.default` — a dev shell with `bun`, `nodejs_24`,
  `prisma` and the matching `prisma-engines_6`,
- `nixosModules.default` — a NixOS module exposing `services.noty.*`.

To run it without installing:

```sh
nix run
```

Supported systems are `x86_64-linux`, `aarch64-linux`, `aarch64-darwin` and
`x86_64-darwin`. The `node_modules` fixed-output derivation's hash is keyed
per system; on a system not listed yet, run
`./scripts/regenerate-nix-hash.sh` to populate it.

#### NixOS module

Import the module and enable the service:

```nix
# configuration.nix
{ config, pkgs, inputs, ... }:
{
  imports = [ inputs.noty.nixosModules.default ];

  services.noty = {
    enable = true;
    # optional overrides
    dataDir = "/var/lib/noty";
    notesDir = "/home/alice/notes";     # root of your markdown notes
    challengesRoot = "/home/alice/ctf"; # optional CTF write-ups root
    port = 3000;
    openFirewall = true;
  };
}
```

The service runs `noty migrate deploy` on every start (a no-op once the
schema is up to date) and serves the generated config file from
`<dataDir>/.config/markdown-render/config.yml`. Full option reference lives
in `options.nix`.

## Configuration

Noty reads `~/.config/markdown-render/config.yml` (written by the Docker and
Nix paths, and editable during `bun` development):

```yaml
notes_dir: /home/alice/notes
challenges_root: /home/alice/ctf
challenges_db_path: /home/alice/.cache/markdown-render/challenges.db
mcp_enabled: true
templates_search_dirs: [assets]
chess_board:
  theme: classic # classic | neo | green | midnight | walnut | dark-blue
  colors: {}
  pieces_dir: ""
```