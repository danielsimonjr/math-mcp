# math-mcp — Overview

`@danielsimonjr/math-mcp` is an MCP (Model Context Protocol) server. The server gives seven mathematics tools to an MCP host. The tools are `evaluate`, `simplify`, `derivative`, `solve`, `matrix_operations`, `statistics` and `unit_conversion`. The `@danielsimonjr/mathts-compat` engine does the calculations. The project ships as an npm package and as a Claude Code plugin. The plugin holds a committed bundle of the server and its dependencies.

## What ships

| Entry point | Kind | How it runs |
|---|---|---|
| `src/index.ts` | MCP server. After `tsc`, the file is `dist/index.js`, the package `main` and `bin`. | Node runs the file. A stdio transport connects the server to an MCP host. |
| `plugin/bundle/index.mjs` | esbuild bundle of `src/index.ts` and all dependencies. The repository holds the bundle. | `plugin/.mcp.json` starts the bundle with `node`. `scripts/bundle.mjs` builds the bundle. |
| `plugin/bundle/wasm/` | WASM binary and manifest. Both are data files. | `scripts/bundle.mjs` copies both files from `@danielsimonjr/mathts-functions`. The MathTS loader checks the SHA-384 hash in the manifest before the loader uses the binary. |
| `test/integration-test.js`, `test/correctness-tests.js`, `test/mcp-protocol-test.js` | Test drivers that Node runs directly. | npm scripts `test`, `test:correctness` and `test:mcp` |
| `scripts/*`, `tools/generate-dependency-graph.ts` | Build and guard scripts. | npm scripts `bundle`, `check:deps` and `graph`. `publish.yml` runs `publish-version-guard.mjs`. A person runs `verify-mathts-coverage.mjs` by hand. |

## Layout

```
src/
├── index.ts             Entry point: server factory, stdio transport, telemetry start and stop
├── register-tools.ts    Tool schemas. Applies the rate limit and the error wrapper to each call.
├── tool-handlers.ts     The seven tool implementations
├── handler-utils.ts     Response builders, handler timing, withErrorHandling
├── math-engine.ts       The one place that builds the MathTS engine
├── validation.ts        Input validation and size limits
├── rate-limiter.ts      Token bucket and concurrency limit. One global limiter.
├── expression-cache.ts  Cache of compiled expressions
├── errors.ts            Error classes
├── health.ts            Health checks for the telemetry server
├── utils.ts             withTimeout, performance tracker, package version
├── types.ts             Empty module. No file imports the module.
├── shared/              constants.ts, logger.ts
└── telemetry/           metrics.ts (prom-client), server.ts (HTTP /metrics and /health)
test/                    15 vitest files (security/, unit/) and 3 direct-run drivers
scripts/ · tools/        Build, guard and graph scripts
plugin/                  Plugin manifest, MCP configuration, bundle and skill
```

## Size

`repo-tools map` counts 39 source files and 10,857 lines. The map does not read `plugin/bundle/`. The bundle and the WASM binary are build output and are not in the count.

| Area | Files | Meaning |
|---|---|---|
| `src` | 19 | 16 files under `src/` and the 3 `.js` drivers in `test/`. The area classifier puts the drivers in `src`. |
| `tests` | 15 | The vitest `*.test.ts` files |
| `tools` | 5 | The files in `scripts/` and `tools/generate-dependency-graph.ts` |

The 16 files under `src/` hold 3,658 lines. The count comes from `file-inventory.json` (the `loc` of each file under `src/`). No `repo-tools` metric records the count.

## Reading the generated reports

The files in this directory that `repo-tools map` writes are generated. Do not edit them by hand. Regenerate them.

One file has no importer. A search of the repository confirms the result.

- **`src/types.ts` has no importer and no export.** The module is empty. The docstring says the file holds shared interfaces. The file holds none. A person can delete the file, or can move shared interfaces into the file.
- **The three drivers in `test/` run by direct execution.** The npm scripts `test`, `test:correctness` and `test:mcp` start them. A static import analysis cannot see a script entry. `repo-tools map` reads the `test/` folder as tests and does not list the drivers as orphans.

`repo-tools map` reports `src/types.ts` as an orphan and as a file with no importer. The other 38 files have an importer or a known role.

## Verification

Generated 2026-10-23 by `repo-tools map`.
Regenerate: `repo-tools map . --out=docs/architecture` · Check: `repo-tools check . --docs=docs/architecture`

| Claim | Value | Source |
|---|---|---|
| totalFiles | 39 | file-inventory.json |
| totalTypeScriptFiles | 39 | dependency-graph.json |
| totalLinesOfCode | 10848 | dependency-graph.json |
| entryRoots | 1 | dependency-graph.json |
| orphanedFiles | 1 | dependency-graph.json |
| noImporterFileCount | 1 | unused-analysis.json |
