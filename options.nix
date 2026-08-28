self: {
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.noty;
  system = pkgs.stdenv.hostPlatform.system;

  # prisma-engines_6 matches the `prisma@^6` npm dependency this project is
  # pinned to — the migrate-deploy step below needs the schema-engine binary at
  # runtime, the same way the flake's own build/devShell wire it up.
  prismaEngines = pkgs.prisma-engines_6;

  # JSON is a valid subset of YAML, so this can be handed straight to
  # app/lib/config.ts's `js-yaml` loader without a templating step.
  configFile = pkgs.writeText "noty-config.yml" (
    builtins.toJSON {
      notes_dir = cfg.notesDir;
      challenges_root = if cfg.challengesRoot == null then "" else cfg.challengesRoot;
      challenges_db_path = cfg.challengesDbPath;
      chess_board = {
        theme = cfg.chessBoard.theme;
        colors = cfg.chessBoard.colors;
        pieces_dir = if cfg.chessBoard.piecesDir == null then "" else cfg.chessBoard.piecesDir;
      };
      templates_search_dirs = cfg.templatesSearchDirs;
      mcp_enabled = cfg.mcpEnabled;
    }
  );
in {
  options.services.noty = {
    enable = lib.mkEnableOption "Noty, a markdown note viewer";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${system}.default;
      defaultText = lib.literalExpression "noty.packages.<system>.default";
      description = "The noty package to run.";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/noty";
      description = ''
        Directory holding noty's generated config file, its cache and the
        SQLite database backing the challenges/vulnerabilities store.
      '';
    };

    notesDir = lib.mkOption {
      type = lib.types.path;
      default = "${cfg.dataDir}/notes";
      defaultText = lib.literalExpression ''"''${config.services.noty.dataDir}/notes"'';
      description = "Root directory of the markdown notes collection to serve.";
      example = "/home/alice/notes";
    };

    challengesRoot = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Optional root directory to discover CTF challenges/vulnerabilities write-ups from.";
    };

    challengesDbPath = lib.mkOption {
      type = lib.types.path;
      default = "${cfg.dataDir}/.cache/noty/challenges.db";
      defaultText = lib.literalExpression ''"''${config.services.noty.dataDir}/.cache/noty/challenges.db"'';
      description = "Path of the SQLite database backing the challenges/vulnerabilities store.";
    };

    mcpEnabled = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to enable the Model Context Protocol server integration.";
    };

    chessBoard = {
      theme = lib.mkOption {
        type = lib.types.enum [
          "classic"
          "neo"
          "green"
          "midnight"
          "walnut"
          "dark-blue"
        ];
        default = "classic";
        description = "Board theme used when rendering chess.js diagrams.";
      };

      colors = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = { };
        description = "Optional square-colour overrides for the chess board.";
        example = { light = "#eeeed2"; dark = "#769656"; };
      };

      piecesDir = lib.mkOption {
        type = lib.types.nullOr lib.types.path;
        default = null;
        description = "Optional path to a directory of custom SVG chess piece files.";
      };
    };

    templatesSearchDirs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ "assets" ];
      description = "Directories, relative to a note's folder, searched for user-defined templates.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "TCP port the noty web server listens on.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address the noty web server binds to.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open {option}`services.noty.port` in the firewall.";
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      description = "Extra environment variables passed to the noty systemd service.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 root root - -"
      "d ${cfg.dataDir}/.config 0750 root root - -"
      "d ${cfg.dataDir}/.config/noty 0750 root root - -"
      "d ${cfg.dataDir}/.cache 0750 root root - -"
      "d ${cfg.dataDir}/.cache/noty 0750 root root - -"
      "L+ ${cfg.dataDir}/.config/noty/config.yml - - - - ${configFile}"
    ];

    systemd.services.noty = {
      description = "Noty markdown note viewer";
      after = [ "network.target" "systemd-tmpfiles-setup.service" ];
      wants = [ "systemd-tmpfiles-setup.service" ];
      wantedBy = [ "multi-user.target" ];

      environment = {
        HOME = cfg.dataDir;
        NODE_ENV = "production";
        NEXT_TELEMETRY_DISABLED = "1";
        DATABASE_URL = "file:${cfg.challengesDbPath}";
        PRISMA_SCHEMA_ENGINE_BINARY = "${prismaEngines}/bin/schema-engine";
        PRISMA_QUERY_ENGINE_BINARY = "${prismaEngines}/bin/query-engine";
        PRISMA_QUERY_ENGINE_LIBRARY = "${prismaEngines}/lib/libquery_engine.node";
      } // cfg.environment;

      serviceConfig = {
        Type = "simple";
        # applies pending SQLite migrations on every start; a no-op once the
        # schema is already up to date
        ExecStartPre = "${cfg.package}/app/node_modules/.bin/prisma migrate deploy --schema ${cfg.package}/app/prisma/schema.prisma";
        ExecStart = "${cfg.package}/bin/noty -p ${toString cfg.port} -H ${cfg.host}";
        Restart = "on-failure";
      };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}