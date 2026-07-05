import { build } from "esbuild";

// ESM banner shim: bundled CJS deps need require/__filename/__dirname.
const banner =
  "import { createRequire as __createRequire } from 'node:module';" +
  "import { fileURLToPath as __fileURLToPath } from 'node:url';" +
  "import { dirname as __dirnameOf } from 'node:path';" +
  "const require = __createRequire(import.meta.url);" +
  "const __filename = __fileURLToPath(import.meta.url);" +
  "const __dirname = __dirnameOf(__filename);";

// Self-contained single-file server for the Claude Code plugin (bundle/index.mjs).
// Bundles src/index.ts + all deps (MathTS, MCP SDK, prom-client) into one ESM file.
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: banner },
  outfile: "bundle/index.mjs",
  logLevel: "warning",
});
console.log("bundled -> bundle/index.mjs");
