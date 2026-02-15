import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
const deps = Object.keys(pkg.dependencies || {});

// Bundle @open-inspect/shared (its ESM exports lack .js extensions, breaking Node resolution)
// Keep other npm packages and node built-ins external
const external = deps.filter((d) => d !== "@open-inspect/shared");

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  outfile: "dist/index.js",
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [...external, "node:*"],
});
