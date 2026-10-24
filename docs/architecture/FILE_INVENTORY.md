<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Complete File Inventory

This report lists each source file that the map census finds, with a disposition. The census reads the files that git tracks. Outside a git work tree, it walks the folder. The census skips tool state, dependency folders and build output (for example `.git/`, `node_modules/`, `dist/` and `target/`), and `obj/` and `bin/` for C#.

**Language**: typescript

**Total files**: 39

## Disposition counts

| Disposition | Count | Meaning |
| --- | --: | --- |
| `reachable` | 14 | A `src`-area file that an entry root reaches. |
| `build-entry` | 1 | A `src`-area file that is an entry root. |
| `test-only` | 0 | A `src`-area file that only a test reaches. |
| `orphan` | 1 | A `src`-area file that nothing reaches. Delete it, or wire it to a root. |
| `test` | 18 | A file in a `test/` or `tests/` folder, or a `*.test.ts` or `*.spec.ts` file. |
| `tool` | 5 | A file in a `tools/` or `scripts/` folder outside `src/`. |
| `config` | 0 | A `*.config.*` file of TypeScript or JavaScript. |
| `example` | 0 | A file in `examples/` or `docs/`. |
| `bench` | 0 | A file in `bench/` or `benchmarks/`, or a `*.bench.*` file. |
| **Total** | **39** | |

## Per-area counts

| Area | Files |
| --- | --: |
| `src` | 16 |
| `tests` | 18 |
| `tools` | 5 |

## Per-package counts

| Package | Files |
| --- | --: |
| `(root)` | 23 |
| `@danielsimonjr/math-mcp` | 16 |

## All files

| File | Package | Area | Disposition | Lines |
| --- | --- | --- | --- | --: |
| `scripts/bundle.mjs` | (root) | tools | tool | 70 |
| `scripts/check-dependencies.js` | (root) | tools | tool | 223 |
| `scripts/publish-version-guard.mjs` | (root) | tools | tool | 73 |
| `scripts/verify-mathts-coverage.mjs` | (root) | tools | tool | 38 |
| `src/errors.ts` | @danielsimonjr/math-mcp | src | reachable | 206 |
| `src/expression-cache.ts` | @danielsimonjr/math-mcp | src | reachable | 224 |
| `src/handler-utils.ts` | @danielsimonjr/math-mcp | src | reachable | 84 |
| `src/health.ts` | @danielsimonjr/math-mcp | src | reachable | 276 |
| `src/index.ts` | @danielsimonjr/math-mcp | src | build-entry | 131 |
| `src/math-engine.ts` | @danielsimonjr/math-mcp | src | reachable | 26 |
| `src/rate-limiter.ts` | @danielsimonjr/math-mcp | src | reachable | 352 |
| `src/register-tools.ts` | @danielsimonjr/math-mcp | src | reachable | 154 |
| `src/shared/constants.ts` | @danielsimonjr/math-mcp | src | reachable | 42 |
| `src/shared/logger.ts` | @danielsimonjr/math-mcp | src | reachable | 128 |
| `src/telemetry/metrics.ts` | @danielsimonjr/math-mcp | src | reachable | 332 |
| `src/telemetry/server.ts` | @danielsimonjr/math-mcp | src | reachable | 334 |
| `src/tool-handlers.ts` | @danielsimonjr/math-mcp | src | reachable | 477 |
| `src/types.ts` | @danielsimonjr/math-mcp | src | orphan | 11 |
| `src/utils.ts` | @danielsimonjr/math-mcp | src | reachable | 293 |
| `src/validation.ts` | @danielsimonjr/math-mcp | src | reachable | 588 |
| `test/correctness-tests.js` | (root) | tests | test | 635 |
| `test/integration-test.js` | (root) | tests | test | 94 |
| `test/mcp-protocol-test.js` | (root) | tests | test | 115 |
| `test/security/bounds.test.ts` | (root) | tests | test | 580 |
| `test/security/dos.test.ts` | (root) | tests | test | 490 |
| `test/security/fuzzing.test.ts` | (root) | tests | test | 442 |
| `test/security/injection.test.ts` | (root) | tests | test | 472 |
| `test/unit/errors.test.ts` | (root) | tests | test | 329 |
| `test/unit/expression-cache.test.ts` | (root) | tests | test | 630 |
| `test/unit/handler-utils.test.ts` | (root) | tests | test | 138 |
| `test/unit/health.test.ts` | (root) | tests | test | 289 |
| `test/unit/rate-limiter.test.ts` | (root) | tests | test | 670 |
| `test/unit/shared/constants.test.ts` | (root) | tests | test | 102 |
| `test/unit/shared/logger.test.ts` | (root) | tests | test | 198 |
| `test/unit/solver.test.ts` | (root) | tests | test | 93 |
| `test/unit/telemetry/metrics.test.ts` | (root) | tests | test | 246 |
| `test/unit/utils.test.ts` | (root) | tests | test | 327 |
| `test/unit/validation.test.ts` | (root) | tests | test | 505 |
| `tools/generate-dependency-graph.ts` | (root) | tools | tool | 440 |

## Skipped links

Links (symbolic links and junctions) that the census did not follow. A link can point to another repository, so no file behind a link is in this inventory or in the graph.

_None._

## Warnings

_None._
