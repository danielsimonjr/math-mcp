# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## v4 — MathTS engine (READ FIRST)

As of v4.0.0 the compute engine is **MathTS** (`@danielsimonjr/mathts-*`), not
mathjs. The 7 MCP tools keep identical I/O contracts; only the internals changed.

- **Engine:** `src/math-engine.ts` builds the instance via
  `@danielsimonjr/mathts-compat` `create(all)` (mathjs-compatible API). Every
  module imports its default export. mathjs and the hand-rolled acceleration
  stack (router/adapter/wasm-executor/gpu/workers, the `wasm/` AS project) were
  **deleted** — MathTS does its own internal tier dispatch. Entry point is
  `dist/index.js` (the old `index-wasm.js` is gone).
- **Dependencies (hybrid):** dev uses local links —
  `npm install file:../mathts/compat file:../mathts/matrix` — so changes to the
  local `~/Github/mathts` monorepo are picked up after a `npm install` refresh +
  `npm run build`. For a committed/published release, pin the published
  `@danielsimonjr/mathts-*@^x.y.z` versions (after the MathTS packages are
  published to npm) and `npm install`.
- **Known limitations:**
  - Large dense matrices are slower than the old WASM path: MathTS's JS matmul
    does ~21s for 800×800 (was 114s before a perf fix; Rust WASM is not yet
    built/packaged). Small matrices — the normal tool use — are fast. DoS for
    huge inputs is enforced by **size limits**, not timeouts (synchronous JS
    can't be interrupted).
  - The old mathjs fork's custom astronomical/nautical/typography units
    (`lightyear`, `parsec`, `AU`, `nauticalMile`, `fathom`, …) are **not** in
    MathTS's unit set; the unit tool returns `Unit "X" not found.` for them.
- **The "WASM modules" build steps below are obsolete** (no `wasm/` project; no
  `build:wasm`/`build:all`/`generate:hashes`). Use `npm run build` (tsc) only.

## Build Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Build WASM modules (requires wasm/ dependencies)
cd wasm && npm install && npm run asbuild && cd ..
# Or: npm run build:wasm (from root)

# Build everything (TypeScript + WASM)
npm run build:all

# Generate WASM hash manifest (after WASM build)
npm run generate:hashes

# Development mode (build + run)
npm run dev
```

## Testing

```bash
# Integration tests (11 tests)
npm test

# Correctness tests
npm run test:correctness

# Unit tests (Vitest)
npm run test:unit

# Security tests (119 tests)
npm run test:security

# Test coverage
npm run test:coverage

# Run all tests
npm run test:all
```

## Code Quality

```bash
# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

## Running the Server

```bash
# Production entry point (WASM-accelerated)
node dist/index-wasm.js

# Basic entry point (mathjs only, no acceleration)
node dist/index.js

# With performance logging
ENABLE_PERF_LOGGING=true node dist/index-wasm.js

# With debug logging
LOG_LEVEL=debug node dist/index-wasm.js
```

## Architecture Overview

### Multi-Tier Acceleration System

The server routes operations through optimal acceleration tiers based on data size:

```
Small Data    → mathjs (pure JS, no overhead)
Medium Data   → WASM (single-threaded, 14x faster)
Large Data    → WebWorkers (multi-threaded, 32x faster)
Very Large    → WebGPU (future, not yet implemented)

Fallback chain: GPU → Workers → WASM → mathjs
```

### Key Source Files

- `src/index-wasm.ts` - Main entry point with MCP server setup and tool definitions
- `src/acceleration-router.ts` - Intelligent routing logic, `AccelerationRouter` class with DI support
- `src/acceleration-adapter.ts` - Clean adapter interface for acceleration
- `src/tool-handlers.ts` - Business logic for all 7 mathematical tools
- `src/wasm-wrapper.ts` - WASM integration layer and threshold constants
- `src/validation.ts` - Input validation and security (expression sandboxing, size limits)
- `src/rate-limiter.ts` - Token bucket rate limiting
- `src/health.ts` - Health check system (Kubernetes-compatible probes)

### Worker Infrastructure (`src/workers/`)

- `worker-pool.ts` - Dynamic worker pool with dependency injection
- `pool-manager.ts` - Worker pool lifecycle management
- `parallel-matrix.ts` - Parallel matrix operations
- `parallel-stats.ts` - Parallel statistics operations
- `backpressure.ts` - Queue overflow handling (REJECT/WAIT/SHED strategies)
- `task-queue.ts` - Priority-based task scheduling

### Telemetry (`src/telemetry/`)

- `metrics.ts` - Prometheus metrics collection
- `server.ts` - HTTP server on port 9090 for `/metrics` and `/health`

### WASM Modules (`wasm/`)

- `assembly/index.ts` - AssemblyScript source (matrix, statistics operations)
- `build/release.wasm` - Compiled WASM binary
- `bindings/index.js` - JavaScript bindings for WASM

Build WASM: `cd wasm && npm run asbuild`

### Test Structure

- `test/integration-test.js` - End-to-end integration tests
- `test/correctness-tests.js` - Mathematical correctness validation
- `test/unit/` - Unit tests (Vitest)
- `test/security/` - Security tests (injection, DoS, fuzzing, bounds)

## Important Patterns

### Tool Handler Pattern

Tools follow this pattern in `tool-handlers.ts`:
```typescript
export async function handleToolName(
  params: ToolParams,
  accelerator?: AccelerationWrapper
): Promise<MCP_Response>
```

### Acceleration Routing

The `AccelerationRouter` class supports dependency injection:
```typescript
const router = new AccelerationRouter(config, workerPool);
await router.initialize();
const { result, tier } = await router.matrixMultiply(a, b);
```

### Threshold-Based Routing

Thresholds defined in `src/wasm-wrapper.ts`:
- Matrix operations: WASM at 10x10+, Workers at 100x100+
- Statistics: WASM at 100+ elements, Workers at 100K+

## Environment Variables

Key configuration options:
- `LOG_LEVEL` - debug|info|warn|error
- `ENABLE_WORKERS` - Enable WebWorker tier (default: true)
- `ENABLE_WASM` - Enable WASM tier (default: true)
- `MIN_WORKERS` / `MAX_WORKERS` - Worker pool sizing
- `TASK_TIMEOUT` - Task timeout in ms (default: 30000)
- `MAX_MATRIX_SIZE` - Maximum matrix dimension (default: 1000)
- `MAX_ARRAY_LENGTH` - Maximum array length (default: 100000)

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

**Entity**: "Math MCP Server" (importance: 10, tags: mcp, mathematics, wasm, typescript, active-project)
