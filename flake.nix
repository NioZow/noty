{
  description = "Noty is note viewing app for markdown files";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      lib = nixpkgs.lib;

      # -----------------------------------------------------------------------
      # Multi-system plumbing.  The dev shell and package are pure per-system
      # derivations; the NixOS module runs on the host's own system, so it
      # selects the matching package from this set at evaluation time.
      #
      # aarch64-linux / x86_64-linux are the primary targets, while the darwin
      # systems cover local `nix develop` / `nix build` on Macs.  The pinned
      # nodeModulesHashes below exist for the systems that have been populated
      # (see `just regenerate-hash`); untested systems fall back to
      # `lib.fakeHash` so the build reports the real hash instead of silently
      # producing an unverifiable store path.
      # -----------------------------------------------------------------------
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forAllSystems = lib.genAttrs systems;

      # -----------------------------------------------------------------------
      # The build needs the exact prisma-engines whose version matches the
      # `prisma@^6` npm dependency.
      #
      # The default `prisma-engines` package tracks Prisma 7, which removed
      # the classic Rust query engine and only ships `schema-engine`.  The
      # classic engines — including `query-engine` and `libquery_engine.node`
      # referenced by the PRISMA_* env vars below — are provided by the pinned
      # 6.x package, matching the `prisma@^6` npm dependencies of this project.
      # -----------------------------------------------------------------------
      prisma-engines = pkgs: pkgs.prisma-engines_6;

      prismaEnv = pkgs: {
        PRISMA_SCHEMA_ENGINE_BINARY = "${(prisma-engines pkgs)}/bin/schema-engine";
        PRISMA_QUERY_ENGINE_BINARY = "${(prisma-engines pkgs)}/bin/query-engine";
        PRISMA_QUERY_ENGINE_LIBRARY = "${(prisma-engines pkgs)}/lib/libquery_engine.node";
      };

      # -----------------------------------------------------------------------
      # Fixed-output `node_modules` cache.
      #
      # `bun install` needs network access to hit the npm registry, which the
      # nix build sandbox otherwise blocks — fetching node_modules has to
      # happen in a fixed-output derivation, whose result is verified against
      # outputHash instead of being sandboxed from the network.
      #
      # Two things make bun's output byte-identical on a given platform, so
      # that verifying against a pinned outputHash is reliable:
      #
      #   1. `bun install` writes files with a fresh mtime each run, which
      #      would make the recursive hash change every build even when the
      #      contents are the same. We normalize every mtime to the epoch.
      #
      #   2. bun only installs the optional platform-specific packages for
      #      the *current* system (e.g. `@next/swc-*`, `@img/sharp-*`,
      #      `@tailwindcss/oxide-*`), so the tree — and therefore its hash —
      #      differs between macOS and Linux. The correct hash is therefore
      #      keyed per system below. Use `just regenerate-hash` (or the
      #      per-system key in scripts/regenerate-nix-hash.sh) whenever
      #      package.json / bun.lock changes, or to populate a system that
      #      isn't listed yet.
      # -----------------------------------------------------------------------
      nodeModulesHashes = {
        aarch64-linux = "sha256-YMgWJCr3cLte+EB3OYle4Fv6ZpGb62w5ecrDSuML8Cg="; # populated via `just regenerate-hash`
        x86_64-linux = "sha256-awObgAFwizZ0obm2w7iuwGGoNlqbuXf7n5Eohk23WzM="; # populated via `just regenerate-hash`
        aarch64-darwin = "sha256-nukSoMcHtVAEQ2ZxrNYa6JZyM68MF+FdqguW9m5SijQ="; # populated via `just regenerate-hash`
        x86_64-darwin = lib.fakeHash;
      };

      mkNodeModules =
        {
          pkgs,
          system,
        }:
        pkgs.stdenvNoCC.mkDerivation {
          pname = "noty-node-modules";
          version = "0.1.0";

          # narrow source used just to resolve dependencies, so edits to app
          # code don't bust the (network-fetching) deps cache
          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./package.json
              ./bun.lock
              ./prisma/schema.prisma
            ];
          };

          nativeBuildInputs = [ pkgs.bun ];

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
            # normalize mtimes so the recursive hash is stable build-to-build
            find "$out" -exec touch -d "@0" {} +
            runHook postInstall
          '';

          dontFixup = true;

          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          outputHash = nodeModulesHashes.${system} or lib.fakeHash;
        };

      # -----------------------------------------------------------------------
      # The runnable noty package: bundles the app's .next build plus the
      # prisma-generated client and launches `bun run start`.  The wrapper
      # script defaults DATABASE_URL to the module's `services.noty.dataDir`
      # (set in options.nix) so a bare `nix run` works standalone too.
      # -----------------------------------------------------------------------
      mkNoty =
        {
          pkgs,
          nodeModules,
        }:
        let
          engines = prisma-engines pkgs;
        in
        pkgs.stdenvNoCC.mkDerivation {
          pname = "noty";
          version = "0.1.0";
          src = self;
          nativeBuildInputs = [ pkgs.bun engines pkgs.prisma pkgs.nodejs_24 ];
          env =
            (prismaEnv pkgs)
            // {
              NEXT_TELEMETRY_DISABLED = "1";
            };
          buildPhase = ''
            runHook preBuild
            export HOME="$TMPDIR"
            cp -r ${nodeModules}/node_modules .
            chmod -R u+w node_modules
            patchShebangs node_modules
            bunx prisma generate
            bun run build
            runHook postBuild
          '';
          installPhase = ''
            runHook preInstall
            mkdir -p "$out/app" "$out/bin"
            cp -r .next node_modules public prisma package.json bun.lock next.config.ts instrumentation.ts instrumentation-node.ts "$out/app/"
            cat > "$out/bin/noty" <<EOF
            #!/usr/bin/env bash
            set -euo pipefail
            cd "$out/app"
            export NODE_ENV=production
            export PRISMA_SCHEMA_ENGINE_BINARY="${engines}/bin/schema-engine"
            export PRISMA_QUERY_ENGINE_BINARY="${engines}/bin/query-engine"
            export PRISMA_QUERY_ENGINE_LIBRARY="${engines}/lib/libquery_engine.node"
            export DATABASE_URL="\''${DATABASE_URL:-file:\$HOME/.cache/noty/challenges.db}"
            exec ${pkgs.bun}/bin/bun run start "\$@"
            EOF
            chmod +x "$out/bin/noty"
            runHook postInstall
          '';
          dontFixup = true;
        };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodeModules = mkNodeModules { inherit pkgs system; };
          noty = mkNoty { inherit pkgs nodeModules; };
        in
        {
          default = noty;
          inherit noty nodeModules;
        }
      );

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.noty}/bin/noty";
        };
      });

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            name = "noty";
            packages = [
              pkgs.bun
              # nodejs_24 is the currently supported LTS (nodejs_20 was removed
              # from nixpkgs upstream); satisfies Next.js 15's >=18.18.
              pkgs.nodejs_24
              (prisma-engines pkgs)
              pkgs.prisma
            ];
            env = prismaEnv pkgs;
            shellHook = ''
              export name="noty"
              if [ ! -d node_modules ]; then
                echo "node_modules not found — running bun install..."
                bun install
              fi
            '';
          };
        }
      );

      # NixOS module. `options.nix` is a function of `self` (it defaults the
      # package to `self.packages.<system>.default`), so we invoke it with
      # `self` here and let it define the whole `services.noty.*` surface.
      nixosModules.default =
        {
          lib,
          pkgs,
          ...
        }:
        {
          imports = [ ((import ./options.nix) self) ];
        };
    };
}