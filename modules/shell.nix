{ inputs, ... }: {
  perSystem = { pkgs, system, ... }: {
    devShells.default = pkgs.mkShell {
      packages = with pkgs; [
        nodejs_24
      ];
    };
  };
}