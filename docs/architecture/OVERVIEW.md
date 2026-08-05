# math-mcp — Overview

`@danielsimonjr/math-mcp` is an MCP (Model Context Protocol) server that exposes seven
mathematics tools (evaluate, solve, derivative, simplify, matrix operations, statistics,
unit conversion) backed by the `@danielsimonjr/mathts-compat` engine. It ships as a Claude
Code plugin with a committed, self-contained bundle.

## What ships

| Entry point | Kind | How it runs |
|---|---|---|
| `src/index.ts` | MCP server (package `main`/`bin` after `tsc`) | stdio transport under an MCP host |
| `bundle/index.mjs` | Committed esbuild bundle (118,477 lines) | executed directly by the Claude Code plugin host |
| `test/integration-test.js`, `test/correctness-tests.js` | Direct-run test drivers | `npm test` / `npm run test:correctness` / CI |
| `scripts/*.mjs`, `scripts/*.js` | Maintenance (bundle, dep-check, coverage-verify) | npm scripts |

## Layout

```
src/
├── index.ts             MCP server: tool registration, request routing (build entry)
├── tool-handlers.ts     The seven tool implementations
├── math-engine.ts       Wrapper over @danielsimonjr/mathts-compat
├── validation.ts        Input validation and bounds
├── rate-limiter.ts      Per-connection rate limiting
├── expression-cache.ts  Parsed-expression cache
├── errors.ts            Error taxonomy (highest fan-in: 12 importers)
├── health.ts · utils.ts · handler-utils.ts
├── shared/              constants, logger
└── telemetry/           prom-client metrics + optional HTTP metrics server
test/                    15 vitest *.test.ts files + 2 direct-run .js drivers
```

Real source is **3,777 LOC under `src/`**; the repo-wide `totalLinesOfCode` of 129,302 is
dominated by the committed `bundle/index.mjs` (118,477 lines). Do not read the repo total
as source size.

## Reading the generated reports

The JSON files beside this document come from `repo_map.py map`. Every entry in the
`orphaned` / `noImporterFiles` lists was verified by hand for this document:

- **Verified live (entry-point shapes the static parser cannot see):** `bundle/index.mjs`
  (plugin host executes it), `scripts/bundle.mjs`, `scripts/check-dependencies.js`,
  `scripts/verify-mathts-coverage.mjs` (npm scripts), `test/integration-test.js` and
  `test/correctness-tests.js` (run by `npm test` and CI directly — they are `.js` drivers
  in `test/` (singular), so the area classifier files them under `src`).
- **`src/types.ts` — genuinely unimported.** Zero importers anywhere in the repo, while
  its own docstring claims it is "referenced from multiple layers". Either dead code or
  drift from a refactor that removed its consumers. Candidate for removal or for its
  interfaces to be re-homed; verify intent before deleting.

## Verification

Generated 2026-08-05 by `repo_map.py map`.
Regenerate: `python repo_map.py map <repo> --out docs/architecture`
Check: `python repo_map.py check <repo> --docs docs/architecture`

| Claim | Value | Source |
|---|---|---|
| totalFiles | 38 | file-inventory.json |
| totalTypeScriptFiles | 38 | dependency-graph.json |
| totalLinesOfCode | 129302 | dependency-graph.json |
| entryRoots | 1 | dependency-graph.json |
| orphanedFiles | 7 | dependency-graph.json |
| noImporterFileCount | 7 | unused-analysis.json |
