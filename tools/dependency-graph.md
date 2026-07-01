# math-mcp Dependency Graph

Generated: 2026-07-01T12:53:20.076Z

## Statistics

- **Source files**: 15
- **Test files**: 15
- **Total dependencies (src->src imports)**: 32
- **Average dependencies per src file**: 2.13
- **Layer violations**: 0
- **Untested src files**: 4

## Layer Violations

_None._ Every import points downward through the layer stack.

## Most Depended-On src Files

| Rank | File | Dependents |
|------|------|------------|
| 1 | `utils.ts` | 8 |
| 2 | `errors.ts` | 6 |
| 3 | `rate-limiter.ts` | 2 |
| 4 | `telemetry/server.ts` | 1 |
| 5 | `tool-handlers.ts` | 1 |
| 6 | `telemetry/metrics.ts` | 1 |
| 7 | `health.ts` | 1 |
| 8 | `math-engine.ts` | 1 |
| 9 | `validation.ts` | 1 |
| 10 | `expression-cache.ts` | 1 |
| 11 | `handler-utils.ts` | 1 |
| 12 | `shared/logger.ts` | 1 |
| 13 | `shared/constants.ts` | 1 |

## Test Coverage Map

| src file | layer | covered by |
|----------|-------|------------|
| `errors.ts` | L2 | `unit/errors.test.ts`<br>`unit/handler-utils.test.ts`<br>`unit/rate-limiter.test.ts`<br>`unit/utils.test.ts`<br>`unit/validation.test.ts` |
| `expression-cache.ts` | L3 | `unit/expression-cache.test.ts` |
| `handler-utils.ts` | L6 | `unit/handler-utils.test.ts` |
| `health.ts` | L8 | `unit/health.test.ts` |
| `index.ts` | L8 | _(none)_ |
| `math-engine.ts` | L? | _(none)_ |
| `rate-limiter.ts` | L3 | `security/dos.test.ts`<br>`unit/rate-limiter.test.ts` |
| `shared/constants.ts` | L1 | `unit/shared/constants.test.ts` |
| `shared/logger.ts` | L1 | `unit/shared/logger.test.ts` |
| `telemetry/metrics.ts` | L8 | `unit/telemetry/metrics.test.ts` |
| `telemetry/server.ts` | L8 | _(none)_ |
| `tool-handlers.ts` | L7 | `security/bounds.test.ts`<br>`security/dos.test.ts`<br>`security/fuzzing.test.ts`<br>`security/injection.test.ts`<br>`unit/solver.test.ts` |
| `types.ts` | L2 | _(none)_ |
| `utils.ts` | L2 | `unit/utils.test.ts` |
| `validation.ts` | L3 | `unit/validation.test.ts` |

## Untested src Files

4 files have no test importing them:

- `index.ts`
- `math-engine.ts`
- `telemetry/server.ts`
- `types.ts`

## Folder Dependencies

### `./`

Depends on:
- `shared/`
- `telemetry/`

### `telemetry/`

Depends on:
- `./`

