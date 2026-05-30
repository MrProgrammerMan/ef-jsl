{ inputs, ... }: {
  perSystem = { pkgs, lib, ... }:
    let
      pname = "drinks-app";
      version = "1.0.0";
    in {
      packages.default = pkgs.buildNpmPackage {
        inherit pname version;
        src = lib.cleanSource ../.;
        npmDepsHash = lib.fakeSha256;
        nodejs = pkgs.nodejs_24;
        dontNpmBuild = true;
        nativeBuildInputs = [ pkgs.makeWrapper ];

        installPhase = ''
          runHook preInstall
          mkdir -p $out/libexec/${pname}
          cp -r server.js public package.json package-lock.json node_modules $out/libexec/${pname}/
          makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/${pname} \
            --add-flags $out/libexec/${pname}/server.js \
            --chdir $out/libexec/${pname}
          runHook postInstall
        '';

        meta.mainProgram = pname;
      };
    };
}
