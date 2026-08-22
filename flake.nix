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
        lib = pkgs.lib;

        # the default `prisma-engines` package tracks Prisma 7, which removed
        # the classic Rust query engine and only ships `schema-engine`.
        # the classic engines — including `query-engine` and
        # `libquery_engine.node` referenced by the PRISMA_* env vars below —
        # are provided by the pinned 6.x package, matching the `prisma@^6`
        # npm dependencies of this project.
        prisma-engines = pkgs.prisma-engines_6;
        name = "noty";
        version = "0.1.0";

        prismaEnv = {
          PRISMA_SCHEMA_ENGINE_BINARY = "${prisma-engines}/bin/schema-engine";
          PRISMA_QUERY_ENGINE_BINARY = "${prisma-engines}/bin/query-engine";
          PRISMA_QUERY_ENGINE_LIBRARY = "${prisma-engines}/lib/libquery_engine.node";
        };

        # narrow source used just to resolve dependencies, so edits to app
        # code don't bust the (network-fetching) deps cache
        depsSrc = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [./package.json ./bun.lock ./prisma/schema.prisma];
        };

        # `bun install` needs network access to hit the npm registry, which
        # the nix build sandbox otherwise blocks — fetching node_modules has
        # to happen in a fixed-output derivation, whose result is verified
        # against outputHash instead of being sandboxed from the network.
        nodeModules = pkgs.stdenvNoCC.mkDerivation {
          pname = "${name}-node-modules";
          inherit version;
          src = depsSrc;

          nativeBuildInputs = [pkgs.bun];

          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR"
            # scripts (incl. `prisma generate`) run later, offline, once the
            # nix-provided engines are on PATH via prismaEnv
            bun install --frozen-lockfile --ignore-scripts
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p "$out"
            cp -r node_modules "$out/node_modules"
            runHook postInstall
          '';

          dontFixup = true;

          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          outputHash = "sha256-awObgAFwizZ0obm2w7iuwGGoNlqbuXf7n5Eohk23WzM=";
        };

        noty = pkgs.stdenvNoCC.mkDerivation {
          pname = name;
          inherit version;
          # whole flake source (git-tracked + untracked-but-not-gitignored
          # files); node_modules/.next/etc are excluded via .gitignore
          src = self;

          # nodejs_24 is needed so `patchShebangs` below can rewrite the
          # `#!/usr/bin/env node` shebangs in node_modules/.bin/* to a real
          # store path — the build sandbox has no /usr/bin/env
          nativeBuildInputs = [pkgs.bun pkgs.nodejs_24 prisma-engines pkgs.prisma];

          env =
            prismaEnv
            // {
              NEXT_TELEMETRY_DISABLED = "1";
            };

          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR"

            cp -r ${nodeModules}/node_modules .
            chmod -R u+w node_modules
            patchShebangs node_modules

            node_modules/.bin/prisma generate
            bun run build

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p "$out/app"
            cp -r .next node_modules public prisma package.json bun.lock next.config.ts "$out/app/"

            mkdir -p "$out/bin"
            cat > "$out/bin/${name}" <<EOF
            #!/usr/bin/env bash
            set -euo pipefail
            cd "$out/app"
            export NODE_ENV=production
            export DATABASE_URL="\''${DATABASE_URL:-file:\$HOME/.cache/markdown-render/challenges.db}"
            exec ${pkgs.bun}/bin/bun run start "\$@"
            EOF
            chmod +x "$out/bin/${name}"

            runHook postInstall
          '';

          dontFixup = true;
        };
      in {
        packages = {
          default = noty;
          inherit noty nodeModules;
        };

        apps.default = {
          type = "app";
          program = "${noty}/bin/${name}";
        };

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

            env = prismaEnv;

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
