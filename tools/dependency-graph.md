# math-mcp Dependency Graph

Generated: 2026-04-30T15:39:23.768Z

## Statistics

- **Source files**: 35
- **Test files**: 25
- **Total dependencies (src->src imports)**: 106
- **Average dependencies per src file**: 3.03
- **Layer violations**: 0
- **Untested src files**: 10

## Layer Violations

_None._ Every import points downward through the layer stack.

## Most Depended-On src Files

| Rank | File | Dependents |
|------|------|------------|
| 1 | `utils.ts` | 20 |
| 2 | `workers/worker-types.ts` | 10 |
| 3 | `errors.ts` | 10 |
| 4 | `workers/worker-pool.ts` | 5 |
| 5 | `mathjs-shim.ts` | 4 |
| 6 | `shared/logger.ts` | 4 |
| 7 | `acceleration-router-compat.ts` | 2 |
| 8 | `types.ts` | 2 |
| 9 | `wasm-wrapper.ts` | 2 |
| 10 | `degradation-policy.ts` | 2 |
| 11 | `rate-limiter.ts` | 2 |
| 12 | `workers/chunk-utils.ts` | 2 |
| 13 | `acceleration-router.ts` | 1 |
| 14 | `workers/parallel-matrix.ts` | 1 |
| 15 | `workers/parallel-stats.ts` | 1 |

## Test Coverage Map

| src file | layer | covered by |
|----------|-------|------------|
| `acceleration-adapter.ts` | L6 | `unit/acceleration-adapter.test.ts` |
| `acceleration-router-compat.ts` | L5 | `unit/acceleration-adapter.test.ts` |
| `acceleration-router.ts` | L5 | `unit/acceleration-router-di.test.ts` |
| `degradation-policy.ts` | L2 | `unit/acceleration-adapter.test.ts`<br>`unit/degradation-policy.test.ts`<br>`unit/routing-utils.test.ts` |
| `errors.ts` | L2 | `unit/errors.test.ts`<br>`unit/handler-utils.test.ts`<br>`unit/rate-limiter.test.ts`<br>`unit/utils.test.ts`<br>`unit/validation.test.ts`<br>`unit/wasm-integrity.test.ts`<br>`unit/workers/task-queue.test.ts` |
| `expression-cache.ts` | L3 | `unit/expression-cache.test.ts` |
| `gpu/webgpu-wrapper.ts` | L4 | _(none)_ |
| `handler-utils.ts` | L6 | `unit/handler-utils.test.ts` |
| `health.ts` | L8 | `unit/health.test.ts` |
| `index-wasm.ts` | L8 | _(none)_ |
| `index.ts` | L8 | _(none)_ |
| `mathjs-shim.ts` | L2 | `unit/mathjs-shim.test.ts` |
| `rate-limiter.ts` | L3 | `security/dos.test.ts`<br>`unit/rate-limiter.test.ts` |
| `routing-utils.ts` | L2 | `unit/routing-utils.test.ts` |
| `shared/constants.ts` | L1 | `unit/shared/constants.test.ts` |
| `shared/logger.ts` | L1 | `unit/shared/logger.test.ts` |
| `telemetry/metrics.ts` | L8 | `unit/telemetry/metrics.test.ts` |
| `telemetry/server.ts` | L8 | _(none)_ |
| `tool-handlers.ts` | L7 | `security/bounds.test.ts`<br>`security/dos.test.ts`<br>`security/fuzzing.test.ts`<br>`security/injection.test.ts` |
| `types.ts` | L2 | _(none)_ |
| `utils.ts` | L2 | `unit/utils.test.ts` |
| `validation.ts` | L3 | `unit/validation.test.ts` |
| `wasm-executor.ts` | L2 | `unit/wasm-executor.test.ts` |
| `wasm-integrity.ts` | L3 | `unit/wasm-integrity.test.ts` |
| `wasm-wrapper.ts` | L4 | _(none)_ |
| `workers/backpressure.ts` | L4 | `unit/workers/backpressure.test.ts` |
| `workers/chunk-utils.ts` | L4 | `unit/workers/chunk-utils.test.ts` |
| `workers/math-worker.ts` | L4 | _(none)_ |
| `workers/parallel-executor.ts` | L4 | _(none)_ |
| `workers/parallel-matrix.ts` | L4 | _(none)_ |
| `workers/parallel-stats.ts` | L4 | _(none)_ |
| `workers/pool-manager.ts` | L4 | `unit/workers/pool-manager.test.ts` |
| `workers/task-queue.ts` | L4 | `unit/workers/task-queue.test.ts` |
| `workers/worker-pool.ts` | L4 | `unit/acceleration-router-di.test.ts` |
| `workers/worker-types.ts` | L4 | `unit/acceleration-router-di.test.ts`<br>`unit/workers/backpressure.test.ts`<br>`unit/workers/pool-manager.test.ts`<br>`unit/workers/task-queue.test.ts` |

## Untested src Files

10 files have no test importing them:

- `gpu/webgpu-wrapper.ts`
- `index-wasm.ts`
- `index.ts`
- `telemetry/server.ts`
- `types.ts`
- `wasm-wrapper.ts`
- `workers/math-worker.ts`
- `workers/parallel-executor.ts`
- `workers/parallel-matrix.ts`
- `workers/parallel-stats.ts`

## Folder Dependencies

### `./`

Depends on:
- `shared/`
- `telemetry/`
- `workers/`

### `gpu/`

Depends on:
- `./`

### `telemetry/`

Depends on:
- `./`

### `workers/`

Depends on:
- `./`
- `shared/`

