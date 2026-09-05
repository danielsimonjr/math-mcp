# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## v4 — MathTS engine (READ FIRST)

As of v4.0.0 the compute engine is **MathTS** (`@danielsimonjr/mathts-*`), not
mathjs. The 7 MCP tools keep identical I/O contracts; only the internals changed.

**v4.1.x** has a real `solve`: exact roots for polynomials of degree ≤ 3
(incl. complex) and a numeric real-root fallback for degree ≥ 4 / transcendental
equations. The root-finding lives in MathTS as a first-class function —
`math.solve(equation, variable)` in `@danielsimonjr/mathts-functions` — and
`handleSolve` only validates input, detects degenerate cases, and formats the
roots. As of **4.1.2** (MathTS functions ≥ 0.2.10) `math.solve` delegates its
degree-≤3 closed form to the engine's Algebra solver `polynomialRoot`.

> **Correction (2026-06-23):** earlier notes here claimed `polynomialRoot` was
> avoided due to a forked-`typed-function` "nested-dispatch" bug. **That was a
> misdiagnosis.** typed-function was correct. The real bug was MathTS's
> `add`/`multiply` declaring only a `number`-variadic, so `add(number, Complex,
> Complex)` (polynomialRoot's `add(b, C, …)` with a complex cube root) had no
> matching signature. Fixed in `@danielsimonjr/mathts-functions@0.2.10` by making
> the variadics `'any, any, ...any'`; `polynomialRoot` now works and `solve` uses
> it. (A minor, non-blocking gap remains: `cbrt(number, allRoots=true)` is still
> unimplemented; the `Complex` allRoots path polynomialRoot needs works.)

- **Engine:** `src/math-engine.ts` builds the instance via
  `@danielsimonjr/mathts-compat` `create(all)` (mathjs-compatible API). Every
  module imports its default export. mathjs and the hand-rolled acceleration
  stack (router/adapter/wasm-executor/gpu/workers, the `wasm/` AS project) were
  **deleted** — MathTS does its own internal tier dispatch. Entry point is
  `dist/index.js` (the old `index-wasm.js` is gone).
- **Dependencies (hybrid):** Bun is the install/script toolchain (`bun.lock`
  authoritative). Dev can use local links —
  `bun add file:../mathts/compat file:../mathts/matrix` — so changes to the
  local `~/Github/mathts` monorepo are picked up after a `bun install` refresh +
  `bun run build`. For a committed/published release, pin the published
  `@danielsimonjr/mathts-*@^x.y.z` versions (after the MathTS packages are
  published to npm) and `bun install`.
- **Known limitations:**
  - Large dense matrices are slower than the old WASM path: MathTS's JS matmul
    does ~21s for 800×800 (was 114s before a perf fix; Rust WASM is not yet
    built/packaged). Small matrices — the normal tool use — are fast. DoS for
    huge inputs is enforced by **size limits**, not timeouts (synchronous JS
    can't be interrupted).
  - The old mathjs fork's custom astronomical/nautical/typography units
    (`lightyear`, `parsec`, `AU`, `nauticalMile`, `fathom`, …) are **not** in
    MathTS's unit set; the unit tool returns `Unit "X" not found.` for them.
  - Speed shorthands `mph` / `kph` / `knot` are **not** units — use the compound
    forms `mi/h` and `km/h` instead. This is **not** a cutover regression:
    stock mathjs (verified against v15.0.0) also errors on these
    (`Undefined symbol mph`); the `unit_conversion` description used to give
    `'mph'` as an example, which never worked on either engine — corrected to
    `'mi/h'` on 2026-06-23.
- **Build is `bun run build` (tsc) only.** There is no `wasm/` project and no
  `build:wasm`/`build:all`/`generate:hashes` scripts — they were removed with the
  accel stack in v4. (CI's obsolete `cd wasm` step was likewise dropped 2026-06-30.)
- **Runtime:** Node ships the MCP server (`node dist/index.js`). Bun is the
  TypeScript-on-Bun toolchain only (install + `bun run` scripts) — same split as
  the sibling `*-mcp` repos.

## Build Commands

```bash
# Install dependencies (bun.lock is authoritative)
bun install

# Build TypeScript to JavaScript (the only build step; tsc)
bun run build

# Development mode (build + run under Node)
bun run dev
```

## Testing

```bash
# Integration tests (12 tests)
bun run test

# Correctness tests
bun run test:correctness

# Unit tests (Vitest)
bun run test:unit

# Security tests (121 tests)
bun run test:security

# Test coverage
bun run test:coverage

# Run all tests
bun run test:all
```

## Code Quality

```bash
# Type checking
bun run type-check

# Linting
bun run lint
bun run lint:fix

# Formatting
bun run format
bun run format:check
```

## Running the Server

```bash
# Entry point (the only one; src/index.ts → dist/index.js, also the bin)
# Node is the shipped runtime — Bun is the toolchain, not the MCP host.
node dist/index.js
# or:
bun start

# With performance logging
ENABLE_PERF_LOGGING=true node dist/index.js

# With debug logging
LOG_LEVEL=debug node dist/index.js
```

## Architecture Overview

### Compute engine (v4)

The server computes via **MathTS** (`@danielsimonjr/mathts-compat`), built in
`src/math-engine.ts`. There is no acceleration router / adapter / WASM / worker
tier — those were deleted in the v4 cutover (see the READ-FIRST note above);
MathTS does its own internal tier dispatch. Large-input protection is enforced
by **size limits** in `src/validation.ts`, not by timeouts or a fallback chain.

### Key Source Files

- `src/index.ts` - Main entry point: MCP server setup + the 7 tool definitions (→ `dist/index.js`, also the `bin`)
- `src/math-engine.ts` - Builds the MathTS instance (`create(all)`); every module imports its default export
- `src/tool-handlers.ts` - Business logic for all 7 mathematical tools
- `src/handler-utils.ts` / `src/utils.ts` - Shared helpers for the handlers
- `src/validation.ts` - Input validation and security (expression sandboxing, size limits)
- `src/rate-limiter.ts` - Token bucket rate limiting
- `src/expression-cache.ts` - Cache for parsed/evaluated expressions
- `src/health.ts` - Health check system (Kubernetes-compatible probes)
- `src/errors.ts` / `src/types.ts` - Error types and shared TypeScript types
- `src/shared/` - `constants.ts`, `logger.ts` (LOG_LEVEL-driven)

### Telemetry (`src/telemetry/`)

- `metrics.ts` - Prometheus metrics collection
- `server.ts` - HTTP server on port 9090 for `/metrics` and `/health`

### Test Structure

- `test/integration-test.js` - End-to-end integration tests
- `test/correctness-tests.js` - Mathematical correctness validation
- `test/unit/` - Unit tests (Vitest)
- `test/security/` - Security tests (injection, DoS, fuzzing, bounds)

## Important Patterns

### Tool Handler Pattern

Each of the 7 tools has a `handle*` function in `tool-handlers.ts` that takes a
typed args object and returns an MCP response. It validates input, calls the
MathTS engine, and formats the result — e.g. `handleSolve`, `handleMatrixOperations`,
`handleStatistics`:
```typescript
export async function handleSolve(args: { /* tool-specific params */ }) { … }
```
There is no `accelerator`/router parameter (the acceleration layer was removed in v4).

## Environment Variables

Env vars actually read from `process.env` in `src/` (verified by grep):
- `LOG_LEVEL` - debug|info|warn|error (`src/shared/logger.ts`; default DEBUG, or INFO when `NODE_ENV=production`)
- `NODE_ENV` - affects the default log level (`src/shared/logger.ts`)
- `ENABLE_PERF_LOGGING` - `true` enables per-call perf logging (`src/shared/constants.ts`, `src/index.ts`)
- `DISABLE_PERF_TRACKING` - `true` disables perf tracking (`src/shared/constants.ts`)
- `OPERATION_TIMEOUT` - default 30000 (`src/shared/constants.ts`)
- `EXPRESSION_CACHE_SIZE` - LRU cache entries, default 1000 (`src/expression-cache.ts`)
- `MAX_REQUESTS_PER_WINDOW` (100), `RATE_LIMIT_WINDOW_MS` (60000), `MAX_CONCURRENT_REQUESTS` (10), `MAX_QUEUE_SIZE` (50) - rate limiter (`src/rate-limiter.ts`)
- `ENABLE_TELEMETRY` (`true` starts the metrics/health HTTP server, default off), `TELEMETRY_PORT` (9090) - (`src/telemetry/server.ts`)

**Size limits are NOT env vars** — `MAX_MATRIX_SIZE` (1000), `MAX_ARRAY_LENGTH`
(100000), `MAX_EXPRESSION_LENGTH` (10000), `MAX_NESTING_DEPTH` (50) are hardcoded
constants in the `LIMITS` object in `src/validation.ts`; changing them needs a
code edit + rebuild.

## Commit Convention

Use conventional commits: `feat:`, `fix:`, `docs:`, `perf:`, `test:`, `chore:`

## Memory Usage

**Use the memory-mcp tools periodically to maintain cross-session context:**

1. **At session start**: Search memory for relevant context
   - `search_nodes` with query "math-mcp" or "Math MCP Server"
   - `get_graph_stats` to see what's stored

2. **During work**: Store important discoveries and decisions
   - Add observations to "Math MCP Server" entity when making changes
   - Record version bumps, bug fixes, new features

3. **At session end**: Persist key learnings before context is lost
   - Summarize what was accomplished
   - Note unfinished tasks or next steps

4. **Periodically**: Maintain graph hygiene
   - Use `compress_graph` to merge similar entities
   - Keep observations concise - prefer updating existing entities over creating new ones

**Entity**: "Math MCP Server" (importance: 10, tags: mcp, mathematics, mathts, typescript, active-project)
