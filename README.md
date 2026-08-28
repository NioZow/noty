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
`$HOME/notes` and a config file at `~/.config/noty/config.yml`.

Build and run in production:

```sh
bun run build
DATABASE_URL="file:$HOME/.cache/noty/challenges.db" bun run start
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
database at `/root/.cache/noty/challenges.db`.

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
`<dataDir>/.config/noty/config.yml`. Full option reference lives
in `options.nix`.

## Configuration

Noty is configured with a YAML file. It reads the merged configuration from
`~/.config/noty/config.yml` (`$XDG_CONFIG_HOME/noty/config.yml`) for bun
development. A commented starter is committed as
[`config.yml.example`](./config.yml.example) — copy it into place and edit:

```sh
mkdir -p ~/.config/noty
cp config.yml.example ~/.config/noty/config.yml
```

When running under Nix or Docker, that `config.yml` is generated for you from
the `services.noty.*` options (see [NixOS module](#nixos-module) and
[Docker](#docker) below) and written to the service's data directory, so you
rarely need to hand-edit it.

Every key is optional; Noty merges your file over its built-in defaults.

### Options

| Key | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `notes_dir` | string | `~/notes` | Root directory of the markdown notes collection to serve. Leading `~` is expanded. |
| `challenges_root` | string | `""` (off) | Optional root directory to discover CTF challenge/vulnerability write-ups from. |
| `challenges_db_path` | string | `~/.cache/noty/challenges.db` | Path of the SQLite database backing the challenges/vulnerabilities store. |
| `mcp_enabled` | bool | `true` | Whether the Model Context Protocol (MCP) server integration is enabled. |
| `templates_search_dirs` | string[] | `["assets"]` | Directories, relative to a note's folder, searched for user-defined templates. |
| `chess_board.theme` | string | `"classic"` | Board theme (see [themes](#themes)). |
| `chess_board.colors` | map | `{}` | Optional per-square colour overrides (see [colors](#colors)). |
| `chess_board.pieces_dir` | string | `""` (off) | Path to a directory of custom SVG chess piece files. |

#### Themes

`chess_board.theme` selects a combination of board colours and, when available,
custom piece artwork:

| Theme | Square colours | Custom pieces |
| ----- | -------------- | ------------- |
| `classic` | Classic checkerboard | built-in |
| `neo` | Blue-grey board | `public/chess/pieces/neo/` SVG set |
| `green` | Green / cream | built-in |
| `midnight` | Dark blue | built-in |
| `walnut` | Warm wood | built-in |
| `dark-blue` | Blue-grey | built-in |

Any theme with assets under `public/chess/pieces/<theme>/` is picked up
automatically: SVG files named `<color><type>.svg` (e.g. `bB.svg`, `wK.svg`)
are used to render that theme's pieces, and the board falls back to the
built-in pieces when no assets exist for the selected theme.

#### Colors

`chess_board.colors` lets you override the square colours on top of the chosen
theme. Supported keys and the equivalent `react-chessboard` props:

| Key | Effect |
| --- | ------ |
| `light_square` | Background of light squares |
| `dark_square` | Background of dark squares |
| `margin` | Board border colour |
| `coordinates` | File/rank notation colour |

### NixOS module options

When using the NixOS module, configure Noty with the `services.noty.*`
options instead of hand-editing `config.yml`. The option values map onto the
same settings above:

| Option | Type | Default |
| ------ | ---- | ------- |
| `enable` | bool | `false` |
| `package` | package | `noty.packages.<system>.default` |
| `dataDir` | path | `/var/lib/noty` |
| `notesDir` | path | `<dataDir>/notes` |
| `challengesRoot` | nullOr path | `null` |
| `challengesDbPath` | path | `<dataDir>/.cache/noty/challenges.db` |
| `mcpEnabled` | bool | `true` |
| `chessBoard.theme` | enum | `"classic"` |
| `chessBoard.colors` | attrsOf str | `{}` |
| `chessBoard.piecesDir` | nullOr path | `null` |
| `templatesSearchDirs` | listOf str | `["assets"]` |
| `port` | port | `3000` |
| `host` | string | `127.0.0.1` |
| `openFirewall` | bool | `false` |