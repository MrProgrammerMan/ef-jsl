{ inputs, self, ... }: {
  flake.nixosModules.default = { config, lib, pkgs, ... }:
    let
      cfg = config.services."drinks-app";
    in {
      options.services."drinks-app" = {
        enable = lib.mkEnableOption "drinks-app";
        package = lib.mkOption {
          type = lib.types.package;
          default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
          description = "The package to use for the drinks app.";
        };
        environmentFiles = lib.mkOption {
          type = lib.types.listOf lib.types.path;
          default = [];
          description = "Environment files passed to systemd.";
        };
      };

      config = lib.mkIf cfg.enable {
        systemd.services."drinks-app" = {
          description = "drinks-app";
          wantedBy = [ "multi-user.target" ];
          after = [ "network.target" ];
          serviceConfig = {
            ExecStart = lib.getExe cfg.package;
            Restart = "on-failure";
            DynamicUser = true;
            EnvironmentFile = cfg.environmentFiles;
          };
        };
      };
    };
}
