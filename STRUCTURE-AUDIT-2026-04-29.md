# STRUCTURE-AUDIT-2026-04-29.md

**Math MCP Server — Codebase Structure Audit**
**Date:** 2026-04-29 (generated 2026-04-30)
**Auditor:** Claude Code (Task 20 of /workflow restructure)
**Scope:** Read-only. No source files modified.

---

## 1. Module Map

### Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Basic MCP server — mathjs-only, no acceleration, no validation pipeline, no rate limiting. Legacy/fallback entry. |
| `src/index-wasm.ts` | Production MCP server — routes all 7 tools through full stack: rate limiting, handlers, acceleration. |

### Tool Layer

| File | Purpose |
|------|---------|
| `src/tool-handlers.ts` | All 7 handler implementations (`handleEvaluate`, `handleSimplify`, `handleDerivative`, `handleSolve`, `handleMatrixOperations`, `handleStatistics`, `handleUnitConversion`). Also defines `AccelerationWrapper` interface and deprecated `WasmWrapper` alias. |
| `src/handler-utils.ts` | Shared boilerplate: `executeHandler` (timing + logging), `successResponse`, `errorResponse`, `withErrorHandling`. Extracted at 3.3.0. |

### Acceleration Tiers

| File | Purpose |
|------|---------|
| `src/mathjs-shim.ts` | Single import surface for local mathjs fork. Resolves ESM default-vs-namespace mismatch. All other src files must use this instead of `'mathjs'` directly. |
| `src/acceleration-adapter.ts` | Implements `AccelerationWrapper` by delegating to `acceleration-router.ts` routed functions. Singleton `accelerationAdapter` exported for use in `index-wasm.ts`. |
| `src/acceleration-router.ts` | `AccelerationRouter` class: GPU → Workers → WASM → mathjs routing per-operation. Also re-exports compat layer functions. |
| `src/acceleration-router-compat.ts` | Deprecated function-based API (e.g., `routedMatrixMultiply`). Wraps a singleton `AccelerationRouter`. Marked `@deprecated`, entire module. |
| `src/wasm-wrapper.ts` | WASM lazy-loading, integrity verification call, threshold constants (`THRESHOLDS`), and all 13 wasm/mathjs routed operation functions. |
| `src/wasm-executor.ts` | Generic `executeUnaryOp` / `executeBinaryOp` with threshold check, perf counters, WASM fallback on error. Extracted at 3.3.0. |
| `src/wasm-integrity.ts` | SHA-256 manifest-based integrity check for WASM binaries. Disabled via `DISABLE_WASM_INTEGRITY_CHECK=true`. |
| `src/routing-utils.ts` | `routeWithFallback` generic function, `RoutingStats`, `TierExecutor` interface. Extracted at 3.3.0. |
| `src/degradation-policy.ts` | `AccelerationTier` enum, `DegradationPolicy` interface, env-var-driven policy factory, `logDegradation`. Layer 1. |
| `src/expression-cache.ts` | LRU cache for compiled mathjs expressions. `getCachedExpression` used by `tool-handlers.ts`. |
| `src/gpu/webgpu-wrapper.ts` | Unimplemented GPU stub. All functions throw `WasmError`. `shouldUseGPU` always returns false. Planned for 4.0+. |
| `src/workers/worker-pool.ts` | `WorkerPool` class: dynamic worker lifecycle, task dispatch to `math-worker.ts`. |
| `src/workers/pool-manager.ts` | `WorkerPoolManager`: named registry of multiple `WorkerPool` instances. |
| `src/workers/math-worker.ts` | Worker-thread entry point. Loads WASM bindings, handles `WorkerRequest` messages. |
| `src/workers/parallel-matrix.ts` | High-level parallel matrix ops: chunks + dispatches to pool, reassembles result. |
| `src/workers/parallel-stats.ts` | High-level parallel stats mean: chunks + dispatches to pool, reassembles. |
| `src/workers/parallel-executor.ts` | Generic parallel execution framework for chunked operations. Added at 3.5.0. |
| `src/workers/task-queue.ts` | Priority task queue used internally by `WorkerPool`. |
| `src/workers/backpressure.ts` | `BackpressureManager`: REJECT / WAIT / SHED strategies for queue overflow. |
| `src/workers/chunk-utils.ts` | `chunkMatrixByRows`, `chunkArray`, `getOptimalChunkCount` — pure utility, no deps on other workers files. |
| `src/workers/worker-types.ts` | All TypeScript interfaces and enums for worker IPC: `WorkerRequest`, `WorkerResponse`, `Task`, `WorkerPoolConfig`, etc. Type guards. |

### Validation / Security

| File | Purpose |
|------|---------|
| `src/validation.ts` | Input validators: `validateExpression`, `validateMatrix`, `validateNumberArray`, `validateScope`, `validateEnum`, `safeJsonParse`, size/complexity limit checks. Depends only on `errors.ts`. |
| `src/errors.ts` | Error hierarchy: `MathMCPError` → `ValidationError` → `SizeLimitError`, `ComplexityError`; also `WasmError`, `TimeoutError`, `RateLimitError`. Re-exports `BackpressureError`. |
| `src/rate-limiter.ts` | Token-bucket rate limiter, `withRateLimit` middleware, `globalRateLimiter` singleton. |

### Infra / Cross-cutting

| File | Purpose |
|------|---------|
| `src/shared/constants.ts` | Layer-1 constants: `DEFAULT_OPERATION_TIMEOUT`, `PERF_TRACKING_ENABLED`, `PERF_LOGGING_ENABLED`. No internal deps. |
| `src/shared/logger.ts` | Layer-1 structured logger with level filtering. Writes to stderr (error/warn) and stdout (info/debug). |
| `src/utils.ts` | Layer-2 utilities: `withTimeout`, `PerformanceTracker`, `getPackageVersion`, `formatNumber`, `isPlainObject`. Re-exports `logger` and `LogLevel` with `@deprecated` tags. |
| `src/health.ts` | Health check: WASM load probe, rate-limiter queue probe, memory probe. Returns K8s-compatible `HealthResponse`. |
| `src/telemetry/metrics.ts` | Prometheus metric definitions and helper functions (`recordOperation`, `recordError`, etc.). Uses `prom-client`. |
| `src/telemetry/server.ts` | HTTP server on port 9090: `/metrics`, `/health`, `/health/live`, `/health/ready`. |

### Test Directories

| Directory | Contents |
|-----------|----------|
| `test/unit/` | 13+ Vitest unit test files (validation, errors, utils, rate-limiter, health, expression-cache, degradation-policy, acceleration-router-di, shared/constants, shared/logger, telemetry/metrics, workers/backpressure, workers/chunk-utils, workers/pool-manager, workers/task-queue) |
| `test/security/` | 4 Vitest security test files (bounds, dos, fuzzing, injection) — all import from `src/tool-handlers.ts` |
| `test/` (root) | `integration-test.js` (11 tests, imports `dist/`), `correctness-tests.js` (imports `dist/` + bare `mathjs`) |

### WASM

| Directory | Contents |
|-----------|----------|
| `wasm/assembly/` | AssemblyScript source |
| `wasm/build/` | Compiled `.wasm` binaries |
| `wasm/bindings/` | `matrix.cjs`, `statistics.cjs` JS bindings loaded at runtime |

---

## 2. Layering and Coupling

### Intended Layer Ordering

```
L1: shared/constants.ts, shared/logger.ts
L2: errors.ts, utils.ts, degradation-policy.ts, wasm-executor.ts, routing-utils.ts
L3: validation.ts, rate-limiter.ts, expression-cache.ts, wasm-integrity.ts
L4: wasm-wrapper.ts, workers/* (pool infra), gpu/webgpu-wrapper.ts
L5: acceleration-router.ts, acceleration-router-compat.ts
L6: acceleration-adapter.ts, handler-utils.ts
L7: tool-handlers.ts
L8: index-wasm.ts (orchestrator), telemetry/*, health.ts
```

### Layering Violations

**Violation 1: Circular import between `acceleration-router.ts` and `acceleration-router-compat.ts`**

- `acceleration-router.ts` (line 91–108) re-exports from `acceleration-router-compat.js`
- `acceleration-router-compat.ts` (line 13) imports `AccelerationRouter` from `acceleration-router.js`

Direct circular dependency. Survives via class-import semantics, but is a latent risk and confuses tree-shaking.

**Violation 2: `acceleration-adapter.ts` imports a type from `tool-handlers.ts`**

- `acceleration-adapter.ts` line 28: `import type { AccelerationWrapper } from './tool-handlers.js'`
- The adapter (L6) imports a type defined in higher-layer handlers (L7).
- Move `AccelerationWrapper` to a neutral location (`src/types.ts` or `src/shared/`).

**Violation 3: `errors.ts` re-exports `BackpressureError` from `workers/backpressure.ts`**

- `errors.ts` (L2) reaches into `workers/backpressure.ts` (L4).
- `BackpressureError` should be defined in `errors.ts` directly.

**Observation: telemetry subsystem is build-complete but runtime-disconnected**

- `telemetry/server.ts` (`startTelemetryServer`) is never invoked by `index-wasm.ts`.
- `telemetry/metrics.ts` helper functions (`recordOperation`, etc.) are never called from `tool-handlers.ts` or `acceleration-router.ts`.
- The Prometheus surface exists in code but produces no data in production.

---

## 3. Duplication and Dead Code

### Files Superseded or Dormant

| File | Status | Notes |
|------|--------|-------|
| `src/index.ts` | Superseded (functional) | Basic mathjs-only server; lacks validation, rate limiting, acceleration. Any tool fix must be applied twice. |
| `src/acceleration-router-compat.ts` | Deprecated (entire file) | All 9 exported functions delegate to `AccelerationRouter` singleton. Only consumers are `acceleration-adapter.ts` and the re-export chain through `acceleration-router.ts`. |
| `src/gpu/webgpu-wrapper.ts` | Stub | All exports throw `WasmError` or return constants. `shouldUseGPU()` hard-coded to false in `acceleration-router.ts`; the stub is never actually loaded. |

### Dead Exports

| Location | Export | Status |
|----------|--------|--------|
| `src/utils.ts` | `formatNumber` | Not imported by any src/ file. Tested in `utils.test.ts` only. |
| `src/utils.ts` | `isPlainObject` | Not imported by any src/ file. Tested in `utils.test.ts` only. |
| `src/wasm-wrapper.ts` | `statsProduct` | Not consumed by router/adapter. `prod` op falls through to mathjs directly. |
| `src/wasm-executor.ts` | `createOperationRegistry` | No caller in any src/ file. |
| `src/wasm-wrapper.ts` | `resetPerfCounters`, `getPerfStats` | No caller in production path. |
| `src/telemetry/server.ts` | All exports | Never imported by `index-wasm.ts`. |
| `src/telemetry/metrics.ts` | Helper functions | Never called from production paths. |

### Duplication

- `PARALLEL_THRESHOLDS` defined redundantly in both `src/workers/parallel-matrix.ts` and `src/workers/parallel-stats.ts`.
- Three "wrap a function" helpers (`withRateLimit`, `withErrorHandling`, `executeHandler`) — adjacent but not identical concerns; naming overlap risks confusion.

---

## 4. Test Coverage Shape (File-Level)

| `src/` file | Covering test file(s) | Gap? |
|-------------|----------------------|------|
| `index.ts` | None | YES |
| `index-wasm.ts` | `test/integration-test.js` (E2E, imports `dist/`) | Partial |
| `mathjs-shim.ts` | None | YES |
| `tool-handlers.ts` | `test/security/{bounds,dos,fuzzing,injection}.test.ts` | Partial — no happy-path unit tests |
| `handler-utils.ts` | None (transitive only) | YES |
| `validation.ts` | `test/unit/validation.test.ts` | Covered |
| `errors.ts` | `test/unit/errors.test.ts` | Covered |
| `utils.ts` | `test/unit/utils.test.ts` | Covered |
| `rate-limiter.ts` | `test/unit/rate-limiter.test.ts` | Covered |
| `health.ts` | `test/unit/health.test.ts` | Covered (3 pre-existing failures) |
| `expression-cache.ts` | `test/unit/expression-cache.test.ts` | Covered |
| `degradation-policy.ts` | `test/unit/degradation-policy.test.ts` | Covered |
| `acceleration-router.ts` | `test/unit/acceleration-router-di.test.ts` | Covered |
| `acceleration-router-compat.ts` | None | YES |
| `acceleration-adapter.ts` | None | YES |
| `wasm-wrapper.ts` | `test/correctness-tests.js` (imports `dist/`) | Partial — no unit test with mocked WASM |
| `wasm-executor.ts` | None | YES |
| `wasm-integrity.ts` | None | YES |
| `routing-utils.ts` | None (transitive only) | YES |
| `shared/constants.ts` | `test/unit/shared/constants.test.ts` | Covered |
| `shared/logger.ts` | `test/unit/shared/logger.test.ts` | Covered |
| `telemetry/metrics.ts` | `test/unit/telemetry/metrics.test.ts` | Covered |
| `telemetry/server.ts` | None | YES |
| `gpu/webgpu-wrapper.ts` | None | YES (stub, low priority) |
| `workers/worker-pool.ts` | `test/unit/acceleration-router-di.test.ts` (indirect) | YES |
| `workers/pool-manager.ts` | `test/unit/workers/pool-manager.test.ts` | Covered |
| `workers/math-worker.ts` | None | YES |
| `workers/parallel-matrix.ts` | None | YES |
| `workers/parallel-stats.ts` | None | YES |
| `workers/parallel-executor.ts` | None | YES |
| `workers/task-queue.ts` | `test/unit/workers/task-queue.test.ts` | Covered |
| `workers/backpressure.ts` | `test/unit/workers/backpressure.test.ts` | Covered |
| `workers/chunk-utils.ts` | `test/unit/workers/chunk-utils.test.ts` | Covered |
| `workers/worker-types.ts` | Covered transitively (types + type guards) | OK |

**Files with no covering test (15):** `index.ts`, `mathjs-shim.ts`, `handler-utils.ts`, `acceleration-router-compat.ts`, `acceleration-adapter.ts`, `wasm-executor.ts`, `wasm-integrity.ts`, `routing-utils.ts`, `telemetry/server.ts`, `gpu/webgpu-wrapper.ts`, `workers/worker-pool.ts` (direct), `workers/parallel-matrix.ts`, `workers/parallel-stats.ts`, `workers/parallel-executor.ts`, `workers/math-worker.ts`.

**Highest-risk gaps** (hot path, no unit test): `handler-utils.ts`, `acceleration-adapter.ts`, `wasm-executor.ts`, `routing-utils.ts`.

---

## 5. Inconsistencies and Smells for Task 21

### 5.1 Pre-existing Test Failures (3 confirmed)

- `test/unit/validation.test.ts` lines 272 + 444 — `/Cannot multiply/` regex doesn't match thrown `Incompatible matrix dimensions: cannot multiply...`; `/exceeds maximum allowed length/` doesn't match thrown `exceeds maximum length of 10000`.
- `test/unit/health.test.ts` — "Memory health check should detect normal memory state" expects `'pass'`, gets `'warn'`. Environmental, but compounded by 5.2.

### 5.2 health.ts: checkWasm() Logic is a No-op

`src/health.ts` lines 79–91: the try block sets `matrixLoaded = true` unconditionally before any actual file-existence check. Health will always report WASM as `pass` regardless of binary presence. Functional bug.

### 5.3 Bare `'mathjs'` Import in `test/correctness-tests.js`

Line 12 does `import * as mathNs from 'mathjs'` directly — bypassing `mathjs-shim.ts`. Currently safe (the test inlines an unwrap), but no comment explaining the divergence; future shim changes could silently affect correctness vs production.

### 5.4 `acceleration-adapter.ts` Imports Type From Higher Layer

Section 2, Violation 2. Move `AccelerationWrapper` to neutral location.

### 5.5 `index.ts` vs `index-wasm.ts` Tool Schema Drift

- `index.ts` line 115: `statistics` enum lists 8 ops (no `product`).
- `index-wasm.ts` line 192: same enum lists 9 ops (with `product`).
- `index.ts` solve handler line 223: allocates unused `_compiled` variable.

### 5.6 `WasmWrapper` Deprecated Type Alias Still Exported

`src/tool-handlers.ts` line 57. Zero consumers anywhere. Dead.

### 5.7 Stale Comment in `index-wasm.ts`

Lines 46–60: DI-usage comment block claims the class API is "currently not used", but the compat shims that ARE used delegate to that class. Comment is technically accurate but misleading.

### 5.8 `formatNumber` and `isPlainObject` Unused in Production

Section 3 dead exports — exported and tested but no production caller.

### 5.9 Threshold Constant Inconsistency

`src/acceleration-router.ts` lines 266, 287, 292 use `WASM_THRESHOLDS.matrix_transpose` (= 20) for `matrix_add` and `matrix_subtract`. Likely copy-paste — verify intent or add dedicated thresholds.

---

## 6. Recommended Ordering for Tasks 21–23

### Task 21 — Code Review Focus

| Priority | File | Reason |
|----------|------|--------|
| 1 | `src/health.ts` | `checkWasm()` no-op bug; 3 pre-existing test failures live here |
| 2 | `src/validation.ts` | Test string-match drift; security-critical |
| 3 | `src/acceleration-adapter.ts` | Layering violation; sole router→handler bridge |
| 4 | `src/acceleration-router-compat.ts` + `src/acceleration-router.ts` | Resolve circular import; consider compat removal |
| 5 | `src/tool-handlers.ts` | Dead `WasmWrapper`; inline validation in `handleUnitConversion` (style drift) |
| 6 | `src/index.ts` | Tool schema drift vs index-wasm; unused `_compiled`; missing validation/rate-limiting |
| 7 | `src/wasm-executor.ts` | Dead `createOperationRegistry`; tighten visibility |
| 8 | `src/acceleration-router.ts` | matrix_add/subtract use wrong threshold constant |

### Task 22 — Coverage Gaps

| Priority | File | Why |
|----------|------|-----|
| 1 | `src/handler-utils.ts` | Hot path, zero direct coverage |
| 2 | `src/wasm-executor.ts` | Core routing logic; mock WASM, test threshold + fallback |
| 3 | `src/routing-utils.ts` | Generic `routeWithFallback`; mock TierExecutors |
| 4 | `src/acceleration-adapter.ts` | Bridge layer |
| 5 | `src/tool-handlers.ts` | Add happy-path unit tests (complement security tests) |
| 6 | `src/acceleration-router-compat.ts` | After circular-import fix, test singleton init |
| 7 | `src/wasm-integrity.ts` | Hash-mismatch + manifest-absent paths with mocked fs |
| 8 | `src/workers/parallel-matrix.ts` / `parallel-stats.ts` / `parallel-executor.ts` | Real-pool integration tests |

### Task 23 — Polish

| Category | Scope |
|----------|-------|
| Dead exports removal | `formatNumber`, `isPlainObject`, `WasmWrapper`, `createOperationRegistry`, `statsProduct`, telemetry helpers if disconnected |
| `any` types | `src/workers/worker-types.ts` lines 114, 194, 196 (`no-explicit-any` is `error` in eslintrc) |
| Style drift | Standardize `tool-handlers.ts` unit-conversion validation (lines 333–388) to use validation.ts helpers |
| Stale comments | `index-wasm.ts` lines 46–60 DI comment; `wasm-wrapper.ts` lazy-init footer comment |
| Circular import resolution | `acceleration-router.ts` ↔ `acceleration-router-compat.ts`; move `AccelerationWrapper` out of `tool-handlers.ts` |
| Threshold audit | Verify `matrix_add` / `matrix_subtract` should use `matrix_transpose` threshold or add dedicated constants |
| `index.ts` schema parity | Sync `statistics` enum to include `product`, or document `index.ts` as intentionally limited |
