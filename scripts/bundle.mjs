import { build } from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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

// The WASM binary is a DATA FILE, so esbuild does not follow it and bundling silently
// breaks how MathTS finds it.
//
// MathTS resolves its binary from `import.meta.url` (core/src/wasm-loader.ts,
// `resolvePackagedWasm`): it walks up at most 8 levels, testing `<dir>/wasm/<file>` then
// `<dir>/dist/wasm/<file>` at each. That is correct while WasmLoader.ts lives inside
// @danielsimonjr/mathts-functions, whose own dist/wasm/ sits one level up. Inlining it into
// bundle/index.mjs moves `import.meta.url` to THIS package, so the walk finds nothing and
// reports `<pluginRoot>/dist/wasm/mathts-as.wasm` — a path that never existed here.
//
// The failure is silent by design: the loader falls back to pure JS and logs to stderr, so
// every answer stays correct and merely gets slower. No test and no gate objects, which is
// why math-mcp 4.1.8 shipped WASM-less and nobody noticed. Found 2026-08-16 by driving the
// DEPLOYED bundle over stdio and reading what it printed.
//
// Copying to bundle/wasm/ satisfies the FIRST candidate at depth 0. Keep the manifest beside
// it: the loader verifies the binary's SHA-384 against wasm-manifest.json before instantiating,
// and that check is a documented security invariant — shipping the wasm without it would
// trade a performance bug for a weaker one.
const WASM_SRC = join(
  "node_modules", "@danielsimonjr", "mathts-functions", "dist", "wasm",
);
const WASM_OUT = join("bundle", "wasm");
const WASM_FILES = ["mathts-as.wasm", "wasm-manifest.json"];

const missing = WASM_FILES.filter((f) => !existsSync(join(WASM_SRC, f)));
if (missing.length) {
  // Fail loudly. A silent skip here reproduces exactly the defect this code fixes.
  console.error(
    `bundle: cannot stage WASM, missing ${missing.join(", ")} in ${WASM_SRC}. ` +
    `Run npm install, or npm run build:wasm in the MathTS monorepo.`,
  );
  process.exit(1);
}

mkdirSync(WASM_OUT, { recursive: true });
for (const f of WASM_FILES) copyFileSync(join(WASM_SRC, f), join(WASM_OUT, f));
console.log(`staged -> ${WASM_OUT}/ (${WASM_FILES.join(", ")})`);
