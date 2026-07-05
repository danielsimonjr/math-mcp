# Math MCP Server - Component Reference

Comprehensive documentation of all components and modules in the Math MCP Server.

## Table of Contents

1. [Component Overview](#component-overview)
2. [Entry Point](#entry-point)
3. [Core Components](#core-components)
4. [Security Components](#security-components)
5. [Caching Components](#caching-components)
6. [Telemetry Components](#telemetry-components)
7. [Utility Components](#utility-components)

---

## Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                          Entry Point                                │
│  index.ts (MCP server + 7 tool definitions → dist/index.js)        │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                      Core Components                                │
│  tool-handlers.ts    handler-utils.ts    errors.ts                 │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                      Compute Engine                                 │
│  math-engine.ts (MathTS — @danielsimonjr/mathts-compat)            │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                   Security Components                               │
│  validation.ts    rate-limiter.ts                                  │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                   Support Components                                │
│  expression-cache.ts   utils.ts   health.ts                        │
│  telemetry/metrics.ts  telemetry/server.ts                         │
└────────────────────────────────────────────────────────────────────┘
```

---

## Entry Point

### `index.ts`

The server's one and only entry point.

| Property | Value |
|----------|-------|
| **Location** | `src/index.ts` |
| **Purpose** | MCP server setup + the 7 tool definitions |
| **Output** | `dist/index.js` (also the package `bin`, run via `npm start` / `node dist/index.js`) |
| **Dependencies** | MCP SDK, tool-handlers.ts, rate-limiter.ts, telemetry/server.ts |

**Key Functions:**
```typescript
async function createServer(): Promise<Server>
function registerHandlers(server: Server): void
async function main(): Promise<void>
```

**Startup:** After the MCP transport connects, `startTelemetryServer()` is called (no-op unless `ENABLE_TELEMETRY=true`). SIGINT/SIGTERM handlers call `stopTelemetryServer()` to release the port cleanly on shutdown.

**Tool Definitions:**
| Tool | Description |
|------|-------------|
| `evaluate` | Evaluate expressions |
| `simplify` | Simplify expressions |
| `derivative` | Calculate derivatives |
| `solve` | Solve equations |
| `matrix_operations` | Matrix math |
| `statistics` | Statistical calculations |
| `unit_conversion` | Unit conversion |

Every tool call is routed through `withRateLimit(globalRateLimiter, …)` (`rate-limiter.ts`) before dispatch to its handler in `tool-handlers.ts`. There is no acceleration/tier layer — MathTS handles all computation directly.

---

## Core Components

### `tool-handlers.ts`

Business logic for all 7 mathematical tools.

| Property | Value |
|----------|-------|
| **Location** | `src/tool-handlers.ts` |
| **Since** | v2.1.0 (refactored v3.3.0) |
| **Dependencies** | math-engine.ts, validation.ts, expression-cache.ts, handler-utils.ts |

**Exported Functions:**

| Function | Purpose |
|----------|---------|
| `handleEvaluate(args)` | Evaluate mathematical expressions |
| `handleSimplify(args)` | Simplify algebraic expressions |
| `handleDerivative(args)` | Calculate derivatives |
| `handleSolve(args)` | Solve equations |
| `handleMatrixOperations(args)` | Matrix operations |
| `handleStatistics(args)` | Statistics |
| `handleUnitConversion(args)` | Unit conversion |

Each handler validates its input, calls into the shared MathTS instance exported by `math-engine.ts`, and formats the result. There is no `accelerator`/router parameter on any handler — the acceleration layer (router/adapter/WASM/workers/GPU) was removed in the v4 MathTS cutover.

**Expression Sandboxing:**
- Whitelist of allowed AST node types
- Forbidden functions blocked: `import`, `createUnit`, `evaluate`, `parse`, `compile`, `help`
- Assignment operations blocked

---

### `handler-utils.ts`

Shared utilities for tool handlers.

| Property | Value |
|----------|-------|
| **Location** | `src/handler-utils.ts` |
| **Purpose** | Common handler patterns and response formatting |

**Exported Functions:**

| Function | Purpose |
|----------|---------|
| `executeHandler(config, fn)` | Execute handler with logging/error handling |
| `successResponse(result)` | Format successful MCP response |
| `errorResponse(error)` | Format an MCP error response (`{ error, errorType }`) |
| `withErrorHandling(handler, args)` | Wrap handler with try/catch, returning `errorResponse` on failure |

**ToolResponse Type:**
```typescript
interface ToolResponse {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
}
```

---

### `errors.ts`

Custom error types for categorized error handling.

| Property | Value |
|----------|-------|
| **Location** | `src/errors.ts` |
| **Since** | v2.1.0 |

**Error Hierarchy:**
```
Error
└── MathMCPError (base)
    ├── ValidationError
    │   ├── SizeLimitError
    │   └── ComplexityError
    ├── WasmError
    ├── TimeoutError
    └── RateLimitError
```

| Error Class | Use Case |
|-------------|----------|
| `MathMCPError` | Base error for all server errors |
| `ValidationError` | Invalid input format/type |
| `SizeLimitError` | Input exceeds size limits |
| `ComplexityError` | Expression too complex |
| `WasmError` | Defined for backward compatibility; unused since the WASM acceleration layer was removed in v4 |
| `TimeoutError` | Operation exceeded timeout |
| `RateLimitError` | Rate limit exceeded (carries an optional `stats` snapshot) |

---

## Security Components

### `validation.ts`

Comprehensive input validation for all operations — the primary defense against oversized input (there is no timeout-based DoS protection; synchronous JS can't be interrupted mid-operation).

| Property | Value |
|----------|-------|
| **Location** | `src/validation.ts` |
| **Since** | v2.1.0 |

**Limits:**
```typescript
const LIMITS = {
  MAX_MATRIX_SIZE: 1000,         // 1000x1000 max
  MAX_ARRAY_LENGTH: 100000,      // 100K elements
  MAX_EXPRESSION_LENGTH: 10000,  // 10K characters
  MAX_NESTING_DEPTH: 50,         // Parentheses depth
  MAX_VARIABLE_NAME_LENGTH: 100,
  MAX_SCOPE_VARIABLES: 100,
};
```

**Validation Functions:**
| Function | Purpose |
|----------|---------|
| `safeJsonParse(json, ctx)` | Safe JSON parsing |
| `validateMatrix(data, ctx)` | Validate 2D number array |
| `validateSquareMatrix(m, ctx)` | Ensure matrix is square |
| `validateMatrixSize(m, ctx)` | Check size limits |
| `validateMatrixCompatibility(a, b, op)` | Check operation compatibility |
| `validateNumberArray(data, ctx)` | Validate number array |
| `validateArrayLength(arr, ctx)` | Check array length |
| `validateExpression(expr, ctx)` | Validate math expression |
| `validateVariableName(name, ctx)` | Validate variable name |
| `validateScope(scope, ctx)` | Validate scope object |
| `validateEnum(val, allowed, ctx)` | Validate enum value |

---

### `rate-limiter.ts`

Token bucket rate limiting for DoS protection.

| Property | Value |
|----------|-------|
| **Location** | `src/rate-limiter.ts` |
| **Since** | v3.1.0 |

**RateLimiter Class:**
```typescript
class RateLimiter {
  constructor(config?: Partial<RateLimiterConfig>)

  allowRequest(): boolean
  allowQueue(): boolean
  startRequest(): void
  endRequest(): void
  queueRequest(): void
  dequeueRequest(): void
  getStats(): {
    concurrent: number;
    queued: number;
    availableTokens: number;
    maxConcurrent: number;
    maxQueued: number;
    maxTokens: number;
  }
  reset(): void
}

async function withRateLimit<T>(limiter: RateLimiter, fn: () => Promise<T>): Promise<T>
```

**Default Configuration:** 100 requests / 60s window, max 10 concurrent, max 50 queued. Overridable via `MAX_REQUESTS_PER_WINDOW`, `RATE_LIMIT_WINDOW_MS`, `MAX_CONCURRENT_REQUESTS`, `MAX_QUEUE_SIZE`.

The exported `globalRateLimiter` instance wraps every tool call from `index.ts`.

---

## Caching Components

### `expression-cache.ts`

LRU cache for parsed mathematical expressions.

| Property | Value |
|----------|-------|
| **Location** | `src/expression-cache.ts` |
| **Since** | v3.1.0 |

**LRUCache Class:**
```typescript
class LRUCache<T> {
  constructor(maxSize: number)
  get(key: string): T | undefined
  set(key: string, value: T): void
  clear(): void
  getStats(): CacheStats
}
```

**Exported Functions:**
```typescript
const expressionCache: LRUCache<any>  // Default: 1000 entries
function generateCacheKey(expression: string, scope?: object): string
function getCachedExpression<T>(expr, computeFn, scope?): T
function getCacheStats(): CacheStats
```

**Environment Variable:**
- `EXPRESSION_CACHE_SIZE` - Cache size (default: 1000)

---

## Telemetry Components

### `telemetry/metrics.ts`

Prometheus metrics collection.

| Property | Value |
|----------|-------|
| **Location** | `src/telemetry/metrics.ts` |
| **Since** | v3.2.0 |

**Metrics:**
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `math_mcp_operation_duration_seconds` | Histogram | operation, tier, status | Operation duration |
| `math_mcp_operation_total` | Counter | operation, tier, status | Total operations |
| `math_mcp_rate_limit_hits_total` | Counter | - | Rate limit hits |
| `math_mcp_cache_operations_total` | Counter | type, result | Cache hit/miss |
| `math_mcp_errors_total` | Counter | type, operation | Error counts |
| `math_mcp_input_size` | Histogram | type | Input sizes |
| `math_mcp_queue_size` | Gauge | type | *Vestigial* — queue size (see note below) |
| `math_mcp_workers` | Gauge | state | *Vestigial* — worker pool state (see note below) |
| `math_mcp_backpressure_events_total` | Counter | strategy, action | *Vestigial* — backpressure events (see note below) |

Also registers default Node.js process metrics (memory, CPU, event loop) via `promClient.collectDefaultMetrics`.

**Note (vestigial metrics):** `math_mcp_queue_size`, `math_mcp_workers`, and
`math_mcp_backpressure_events_total` remain registered in `metrics.ts` from the
pre-v4 worker/queue subsystem that was removed in the MathTS cutover. Nothing
in the current codebase calls their updater functions
(`updateQueueSize`/`updateWorkerMetrics`/`recordBackpressureEvent`), so they
always read 0 on `GET /metrics` — they do not indicate an active worker pool.

**Helper Functions:**
```typescript
function recordOperation(operation, tier, durationMs, status): void
function recordError(errorType, operation): void
function recordCacheOperation(type, hit, size?): void
function recordRateLimitHit(): void
function updateQueueSize(type, size): void          // vestigial — unused
function updateWorkerMetrics(total, idle, busy): void  // vestigial — unused
function recordBackpressureEvent(strategy, action): void // vestigial — unused
function getMetrics(): Promise<string>
function getMetricsJSON(): Promise<MetricObject[]>
```

---

### `telemetry/server.ts`

HTTP server for metrics and health endpoints.

| Property | Value |
|----------|-------|
| **Location** | `src/telemetry/server.ts` |
| **Port** | 9090 (configurable via `TELEMETRY_PORT`) |
| **Enabled by** | `ENABLE_TELEMETRY=true` |

**Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `GET /metrics` | Prometheus text format |
| `GET /health` | Health status |
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness probe |

---

### `health.ts`

Health check system for monitoring.

| Property | Value |
|----------|-------|
| **Location** | `src/health.ts` |
| **Since** | v3.2.0 |

**Functions:**
```typescript
async function getHealthStatus(): Promise<HealthResponse>
function getLiveness(): boolean
async function getReadiness(): Promise<boolean>
```

**Health Checks:**
- WASM module status (uses `fs.existsSync` to check for binding files under `../wasm/bindings/`; since the `wasm/` project was removed in v4, this check reports `warn`)
- Rate limiter status
- Memory usage

**HealthResponse:**
```typescript
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    wasm: HealthCheck;
    rateLimit: HealthCheck;
    memory: HealthCheck;
  };
}
```

---

## Utility Components

### `utils.ts`

General utilities and logging.

| Property | Value |
|----------|-------|
| **Location** | `src/utils.ts` |

**Exported:**
```typescript
const logger: Logger
async function getPackageVersion(): Promise<string>
async function withTimeout<T>(promise, timeoutMs, name): Promise<T>
const perfTracker: PerformanceTracker
const DEFAULT_OPERATION_TIMEOUT: number  // 30000ms
```

---

### `shared/logger.ts`

Logging configuration.

| Property | Value |
|----------|-------|
| **Location** | `src/shared/logger.ts` |

**Log Levels:** `debug`, `info`, `warn`, `error`

**Environment Variable:** `LOG_LEVEL`

---

### `shared/constants.ts`

Shared constants across modules.

| Property | Value |
|----------|-------|
| **Location** | `src/shared/constants.ts` |

---

## Related Documentation

- [DATAFLOW.md](DATAFLOW.md) - Data flow patterns
- [USER_GUIDE.md](USER_GUIDE.md) - User guide
