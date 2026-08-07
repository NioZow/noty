{
  description = "Noty is note viewing app for markdown files";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = nixpkgs.legacyPackages.${system};

        # the default `prisma-engines` package tracks Prisma 7, which removed
        # the classic Rust query engine and only ships `schema-engine`.
        # the classic engines — including `query-engine` and
        # `libquery_engine.node` referenced by the PRISMA_* env vars below —
        # are provided by the pinned 6.x package, matching the `prisma@^6`
        # npm dependencies of this project.
        prisma-engines = pkgs.prisma-engines_6;
        name = "noty";
      in {
        devShells = {
          default = pkgs.mkShell {
            inherit name;

            packages = [
              pkgs.bun
              # nodejs_20 was removed from nixpkgs (upstream EOL 2026-04-30);
              # nodejs_24 is the current LTS and satisfies Next.js 15's
              # >=18.18 requirement.
              pkgs.nodejs_24
              prisma-engines
              pkgs.prisma
            ];

            env = {
              # point the Prisma CLI and client at the nix-provided engines
              # instead of downloading platform binaries at install time
              PRISMA_SCHEMA_ENGINE_BINARY = "${prisma-engines}/bin/schema-engine";
              PRISMA_QUERY_ENGINE_BINARY = "${prisma-engines}/bin/query-engine";
              PRISMA_QUERY_ENGINE_LIBRARY = "${prisma-engines}/lib/libquery_engine.node";
            };

            shellHook = ''
              export name="${name}"

              if [ ! -d node_modules ]; then
                echo "node_modules not found — running bun install..."
                bun install
              fi
            '';
          };
        };
      }
    );
}
