# Math MCP Server - Component Reference

Comprehensive documentation of all components and modules in the Math MCP Server.

## Table of Contents

1. [Component Overview](#component-overview)
2. [Entry Points](#entry-points)
3. [Core Components](#core-components)
4. [Acceleration Layer](#acceleration-layer)
5. [Worker Infrastructure](#worker-infrastructure)
6. [Security Components](#security-components)
7. [Caching Components](#caching-components)
8. [Telemetry Components](#telemetry-components)
9. [Utility Components](#utility-components)
10. [Type Definitions](#type-definitions)

---

## Component Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                        Entry Points                                 │
│  index-wasm.ts (production)    index.ts (basic)                    │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                      Core Components                                │
│  tool-handlers.ts    handler-utils.ts    errors.ts                 │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                    Acceleration Layer                               │
│  acceleration-router.ts   acceleration-adapter.ts                  │
│  wasm-wrapper.ts          wasm-executor.ts                         │
│  degradation-policy.ts    routing-utils.ts                         │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                   Worker Infrastructure                             │
│  worker-pool.ts    task-queue.ts    backpressure.ts               │
│  parallel-matrix.ts  parallel-stats.ts  parallel-executor.ts       │
│  math-worker.ts    chunk-utils.ts    worker-types.ts               │
└────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                   Security Components                               │
│  validation.ts    rate-limiter.ts    wasm-integrity.ts             │
└────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────┐
│                   Support Components                                │
│  expression-cache.ts   utils.ts   health.ts                        │
│  telemetry/metrics.ts  telemetry/server.ts                         │
└────────────────────────────────────────────────────────────────────┘
```

---

## Entry Points

### `index-wasm.ts`

**Production entry point** with multi-tier acceleration.

| Property | Value |
|----------|-------|
| **Location** | `src/index-wasm.ts` |
| **Purpose** | Main MCP server with WASM/Worker acceleration |
| **Dependencies** | MCP SDK, tool-handlers, acceleration-adapter, rate-limiter |

**Key Exports:**
- Creates MCP server instance
- Registers 7 mathematical tools
- Connects via stdio transport

**Key Functions:**
```typescript
async function createServer(): Promise<Server>
function registerHandlers(server: Server): void
async function main(): Promise<void>
```

**Tool Definitions:**
| Tool | Description | Accelerated |
|------|-------------|-------------|
| `evaluate` | Evaluate expressions | No |
| `simplify` | Simplify expressions | No |
| `derivative` | Calculate derivatives | No |
| `solve` | Solve equations | No |
| `matrix_operations` | Matrix math | Yes |
| `statistics` | Statistical calculations | Yes |
| `unit_conversion` | Unit conversion | No |

---

### `index.ts`

**Basic entry point** without acceleration (mathjs only).

| Property | Value |
|----------|-------|
| **Location** | `src/index.ts` |
| **Purpose** | Simple server for basic use or testing |
| **Dependencies** | MCP SDK, mathjs |

Use this when:
- WASM/Workers not available
- Minimal memory footprint needed
- Testing basic functionality

---

## Core Components

### `tool-handlers.ts`

Business logic for all 7 mathematical tools.

| Property | Value |
|----------|-------|
| **Location** | `src/tool-handlers.ts` |
| **Since** | v2.1.0 (refactored v3.3.0) |
| **Dependencies** | validation.ts, expression-cache.ts, handler-utils.ts |

**Exported Functions:**

| Function | Purpose |
|----------|---------|
| `handleEvaluate(args)` | Evaluate mathematical expressions |
| `handleSimplify(args)` | Simplify algebraic expressions |
| `handleDerivative(args)` | Calculate derivatives |
| `handleSolve(args)` | Solve equations |
| `handleMatrixOperations(args, accel?)` | Matrix operations with acceleration |
| `handleStatistics(args, accel?)` | Statistics with acceleration |
| `handleUnitConversion(args)` | Unit conversion |

**AccelerationWrapper Interface:**
```typescript
interface AccelerationWrapper {
  matrixMultiply(a: number[][], b: number[][]): Promise<number[][]>;
  matrixDeterminant(matrix: number[][]): Promise<number>;
  matrixTranspose(matrix: number[][]): Promise<number[][]>;
  matrixAdd(a: number[][], b: number[][]): Promise<number[][]>;
  matrixSubtract(a: number[][], b: number[][]): Promise<number[][]>;
  statsMean(data: number[]): Promise<number>;
  statsMedian(data: number[]): Promise<number>;
  statsMode(data: number[]): Promise<number[]>;
  statsStd(data: number[]): Promise<number>;
  statsVariance(data: number[]): Promise<number>;
  statsMin(data: number[]): Promise<number>;
  statsMax(data: number[]): Promise<number>;
  statsSum(data: number[]): Promise<number>;
}
```

**Expression Sandboxing:**
- Whitelist of allowed AST node types
- Forbidden functions blocked: `import`, `evaluate`, `parse`, `compile`, `help`
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
| `successResponse(content)` | Format successful MCP response |
| `withErrorHandling(handler, args)` | Wrap handler with try/catch |

**ToolResponse Type:**
```typescript
interface ToolResponse {
  content: { type: "text"; text: string }[];
  isError?: boolean;
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
    ├── RateLimitError
    └── BackpressureError
```

| Error Class | Use Case |
|-------------|----------|
| `MathMCPError` | Base error for all server errors |
| `ValidationError` | Invalid input format/type |
| `SizeLimitError` | Input exceeds size limits |
| `ComplexityError` | Expression too complex |
| `WasmError` | WASM initialization/execution failure |
| `TimeoutError` | Operation exceeded timeout |
| `RateLimitError` | Rate limit exceeded |
| `BackpressureError` | Queue overflow (see OVERFLOW.md) |

---

## Acceleration Layer

### `acceleration-router.ts`

Intelligent tier-based routing for mathematical operations.

| Property | Value |
|----------|-------|
| **Location** | `src/acceleration-router.ts` |
| **Since** | v3.0.0 (refactored v3.3.0) |
| **Dependencies** | wasm-wrapper.ts, parallel-*.ts, degradation-policy.ts |

**AccelerationRouter Class:**
```typescript
class AccelerationRouter {
  constructor(config?: AccelerationRouterConfig, workerPool?: WorkerPool)

  // Lifecycle
  async initialize(): Promise<void>
  async shutdown(): Promise<void>

  // Matrix operations
  async matrixMultiply(a, b): Promise<{ result, tier }>
  async matrixTranspose(matrix): Promise<{ result, tier }>
  async matrixAdd(a, b): Promise<{ result, tier }>
  async matrixSubtract(a, b): Promise<{ result, tier }>
  async matrixDeterminant(matrix): Promise<number>

  // Statistics operations
  async statsMean(data): Promise<{ result, tier }>
  async statsMedian(data): Promise<number>
  async statsStd(data): Promise<number>
  async statsVariance(data): Promise<number>
  async statsMin(data): Promise<number>
  async statsMax(data): Promise<number>
  async statsSum(data): Promise<number>
  async statsMode(data): Promise<number | number[]>

  // Statistics
  getRoutingStats(): RoutingStats
  resetRoutingStats(): void
}
```

**Configuration:**
```typescript
interface AccelerationRouterConfig {
  enableWorkers?: boolean;      // Default: true
  workerPoolConfig?: WorkerPoolConfig;
  degradationPolicy?: DegradationPolicy;
}
```

---

### `wasm-wrapper.ts`

WASM integration with lazy loading and automatic fallback.

| Property | Value |
|----------|-------|
| **Location** | `src/wasm-wrapper.ts` |
| **Since** | v2.0.0 (refactored v3.3.0, lazy loading v3.4.0) |

**Lazy Initialization:**
```typescript
// Thread-safe lazy loading
export async function ensureWasmInitialized(): Promise<void>
```

**Performance Thresholds:**
```typescript
const THRESHOLDS = {
  matrix_multiply: 10,   // Use WASM for 10x10+ matrices
  matrix_det: 5,         // Use WASM for 5x5+ matrices
  matrix_transpose: 20,  // Use WASM for 20x20+ matrices
  statistics: 100,       // Use WASM for 100+ elements
  median: 50,            // Lower threshold for sorting
};
```

**Exported Operations:**
| Function | Threshold | Speedup |
|----------|-----------|---------|
| `matrixMultiply(a, b)` | 10x10 | 8x |
| `matrixDeterminant(m)` | 5x5 | 17x |
| `matrixTranspose(m)` | 20x20 | 2x |
| `matrixAdd(a, b)` | 20x20 | - |
| `matrixSubtract(a, b)` | 20x20 | - |
| `statsMean(data)` | 100 | 15-33x |
| `statsMedian(data)` | 50 | 15x |
| `statsStd(data)` | 100 | 30x |
| `statsVariance(data)` | 100 | 30x |
| `statsMin(data)` | 100 | 15x |
| `statsMax(data)` | 100 | 15x |
| `statsSum(data)` | 100 | 20x |
| `statsMode(data)` | 100 | - |
| `statsProduct(data)` | 100 | - |

**Performance Statistics:**
```typescript
function getPerfStats(): PerfStats
function resetPerfCounters(): void

interface PerfStats {
  wasmCalls: number;
  mathjsCalls: number;
  totalCalls: number;
  wasmPercentage: string;
  avgWasmTime: string;
  avgMathjsTime: string;
  wasmInitialized: boolean;
}
```

---

### `wasm-executor.ts`

Generic WASM operation execution with threshold-based routing.

| Property | Value |
|----------|-------|
| **Location** | `src/wasm-executor.ts` |
| **Since** | v3.3.0 |

**Operation Configurations:**
```typescript
interface UnaryOperationConfig<TInput, TOutput> {
  name: string;
  threshold: number;
  getSize: (input: TInput) => number;
  wasmFn: (input: TInput) => TOutput;
  mathjsFn: (input: TInput) => TOutput;
  extraCheck?: (input: TInput) => boolean;
}

interface BinaryOperationConfig<TInput1, TInput2, TOutput> {
  name: string;
  threshold: number;
  getSize: (a: TInput1, b: TInput2) => number;
  wasmFn: (a: TInput1, b: TInput2) => TOutput;
  mathjsFn: (a: TInput1, b: TInput2) => TOutput;
  extraCheck?: (a: TInput1, b: TInput2) => boolean;
}
```

---

### `degradation-policy.ts`

Graceful degradation configuration for acceleration tiers.

| Property | Value |
|----------|-------|
| **Location** | `src/degradation-policy.ts` |
| **Since** | v3.1.1 |

**Acceleration Tiers:**
```typescript
enum AccelerationTier {
  MATHJS = 'mathjs',   // Priority 0 (always available)
  WASM = 'wasm',       // Priority 1
  WORKERS = 'workers', // Priority 2
  GPU = 'gpu',         // Priority 3 (future)
}
```

**Environment Variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_GPU` | `false` | Enable GPU tier |
| `ENABLE_WORKERS` | `true` | Enable Workers tier |
| `ENABLE_WASM` | `true` | Enable WASM tier |
| `NOTIFY_DEGRADATION` | `true` | Log degradation events |

**Fallback Chain:** `GPU → Workers → WASM → mathjs`

---

### `routing-utils.ts`

Generic routing utilities for tier-based operations.

| Property | Value |
|----------|-------|
| **Location** | `src/routing-utils.ts` |
| **Since** | v3.3.0 |

**Key Functions:**
```typescript
function routeWithFallback<T>(config: RouteConfig<T>, stats: RoutingStats): Promise<{ result: T; tier: AccelerationTier }>
function createRoutingStats(): RoutingStats
function computeRoutingStatsSummary(stats: RoutingStats): RoutingStatsSummary
```

**RouteConfig Interface:**
```typescript
interface RouteConfig<TResult> {
  operation: string;
  size: number;
  tiers: TierExecutor<TResult>[];
  fallback: () => TResult | Promise<TResult>;
}

interface TierExecutor<TResult> {
  tier: AccelerationTier;
  shouldUse: () => boolean;
  execute: () => Promise<TResult>;
}
```

---

### `acceleration-adapter.ts`

Clean adapter interface for acceleration operations.

| Property | Value |
|----------|-------|
| **Location** | `src/acceleration-adapter.ts` |
| **Since** | v3.0.0 |

Provides simplified interface for tool handlers to use acceleration without knowing implementation details.

---

### `wasm-integrity.ts`

SHA-256 integrity verification for WASM modules.

| Property | Value |
|----------|-------|
| **Location** | `src/wasm-integrity.ts` |
| **Since** | v3.1.0 |

**Functions:**
```typescript
async function verifyWasmIntegrity(wasmPath: string, hashKey: string): Promise<void>
function isIntegrityCheckEnabled(): boolean
```

**Environment Variable:**
- `DISABLE_WASM_INTEGRITY=true` - Skip verification (dev only)

---

## Worker Infrastructure

### `worker-pool.ts`

Dynamic worker pool manager for parallel operations.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/worker-pool.ts` |
| **Since** | v3.0.0 |

**WorkerPool Class:**
```typescript
class WorkerPool {
  constructor(config?: WorkerPoolConfig)

  async initialize(): Promise<void>
  async execute<T extends WorkerResult>(request: ExecuteRequest): Promise<T>
  async shutdown(gracePeriod?: number): Promise<void>

  isInitialized(): boolean
  isShuttingDown(): boolean
  getAvailableWorkerCount(): number
  getPendingTaskCount(): number
  getStats(): WorkerPoolStats
}
```

**Configuration:**
```typescript
interface WorkerPoolConfig {
  maxWorkers?: number;           // Default: CPU cores - 1
  minWorkers?: number;           // Default: 2 (0 for auto-scaling)
  workerIdleTimeout?: number;    // Default: 60000ms
  taskTimeout?: number;          // Default: 30000ms
  maxQueueSize?: number;         // Default: 1000
  enablePerformanceTracking?: boolean;
  enableDebugLogging?: boolean;
}
```

**See also:** [OVERFLOW.md](OVERFLOW.md) for queue overflow handling

---

### `task-queue.ts`

Priority-based task scheduling for worker pool.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/task-queue.ts` |
| **Since** | v3.0.0 |

**TaskQueue Class:**
```typescript
class TaskQueue {
  constructor(config?: { maxQueueSize?: number; taskTimeout?: number })

  enqueue(task: Task): void
  dequeue(): Task | null
  assignTask(task: Task, worker: WorkerMetadata): void
  completeTask(taskId: string, result: any): void
  failTask(taskId: string, error: Error): void
  scheduleNext(workers: WorkerMetadata[]): boolean
  cancelAll(reason: string): void

  size(): number
  activeCount(): number
  isEmpty(): boolean
  getStats(): QueueStats
  getTaskInfo(taskId: string): TaskInfo | null
}
```

**Task Interface:**
```typescript
interface Task {
  id: string;
  operation: OperationType;
  data: WorkerRequestData;
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  priority?: number;
  createdAt: number;
  trackPerformance?: boolean;
}
```

---

### `backpressure.ts`

Queue overflow handling with multiple strategies.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/backpressure.ts` |
| **Since** | v3.2.0 |

**See:** [OVERFLOW.md](OVERFLOW.md) for complete documentation

---

### `parallel-matrix.ts`

Parallel matrix operations using worker pool.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/parallel-matrix.ts` |
| **Since** | v3.0.0 |

**Functions:**
```typescript
function shouldUseParallel(size: number, operation: string): boolean
async function parallelMatrixMultiply(a, b, pool): Promise<number[][]>
async function parallelMatrixTranspose(matrix, pool): Promise<number[][]>
async function parallelMatrixAdd(a, b, pool): Promise<number[][]>
async function parallelMatrixSubtract(a, b, pool): Promise<number[][]>
```

**Parallel Thresholds:**
| Operation | Threshold |
|-----------|-----------|
| multiply | 100x100 |
| transpose | 200x200 |
| add/subtract | 200x200 |

---

### `parallel-stats.ts`

Parallel statistics operations using worker pool.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/parallel-stats.ts` |
| **Since** | v3.0.0 |

**Functions:**
```typescript
function shouldUseParallel(size: number, operation: string): boolean
async function parallelStatsMean(data, pool): Promise<number>
```

**Parallel Threshold:** 100,000 elements

---

### `parallel-executor.ts`

Generic framework for parallel operations.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/parallel-executor.ts` |
| **Since** | v3.5.0 |

**ParallelOperationConfig:**
```typescript
interface ParallelOperationConfig<TInput, TChunk, TResult extends WorkerResult> {
  name: string;
  operationType: OperationType;
  minChunkSize: number;
  chunk: (input: TInput, numChunks: number) => ChunkData<TChunk>[];
  createRequest: (chunk: ChunkData<TChunk>, input: TInput) => Record<string, unknown>;
  merge: (results: TResult[], input: TInput, chunks: ChunkData<TChunk>[]) => TResult;
}
```

**Utility Functions:**
```typescript
function getOptimalChunkCount(dataSize, availableWorkers, minChunkSize): number
function chunkArray<T>(data: T[], numChunks: number): ChunkData<T[]>[]
function chunkMatrixRows(matrix: number[][], numChunks: number): ChunkData<number[][]>[]
function mergeSum(results: number[]): number
function mergeMin(results: number[]): number
function mergeMax(results: number[]): number
```

---

### `chunk-utils.ts`

Data chunking utilities for parallel distribution.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/chunk-utils.ts` |
| **Since** | v3.0.0 |

**Functions:**
```typescript
function chunkArray<T>(array: T[], numChunks: number): DataChunk<T[]>[]
function chunkMatrixByRows(matrix: number[][], numChunks: number): DataChunk<number[][]>[]
function calculateChunkSize(totalSize: number, numWorkers: number, minSize: number): number
```

---

### `math-worker.ts`

Worker thread implementation that processes mathematical operations.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/math-worker.ts` |
| **Since** | v3.0.0 |

Handles:
- Matrix operations (multiply, transpose, add, subtract, determinant)
- Statistics operations (mean, sum, min, max, variance, std)
- WASM module loading within worker
- Error handling and performance tracking

---

## Security Components

### `validation.ts`

Comprehensive input validation for all operations.

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

**See:** [OVERFLOW.md](OVERFLOW.md) for complete documentation

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
| `math_mcp_queue_size` | Gauge | type | Queue sizes |
| `math_mcp_workers` | Gauge | state | Worker counts |
| `math_mcp_rate_limit_hits_total` | Counter | - | Rate limit hits |
| `math_mcp_cache_operations_total` | Counter | type, result | Cache hit/miss |
| `math_mcp_errors_total` | Counter | type, operation | Error counts |
| `math_mcp_backpressure_events_total` | Counter | strategy, action | Backpressure events |
| `math_mcp_input_size` | Histogram | type | Input sizes |

**Helper Functions:**
```typescript
function recordOperation(operation, tier, durationMs, status): void
function recordError(errorType, operation): void
function updateQueueSize(type, size): void
function updateWorkerMetrics(total, idle, busy): void
function recordCacheOperation(type, hit, size?): void
function recordRateLimitHit(): void
function recordBackpressureEvent(strategy, action): void
function getMetrics(): Promise<string>
function getMetricsJSON(): Promise<MetricObject[]>
```

---

### `telemetry/server.ts`

HTTP server for metrics and health endpoints.

| Property | Value |
|----------|-------|
| **Location** | `src/telemetry/server.ts` |
| **Port** | 9090 (configurable) |

**Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `GET /metrics` | Prometheus text format |
| `GET /metrics/json` | JSON metrics |
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
- WASM module status
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

## Type Definitions

### `worker-types.ts`

Type definitions for worker infrastructure.

| Property | Value |
|----------|-------|
| **Location** | `src/workers/worker-types.ts` |
| **Since** | v3.0.0 |

**Enums:**
```typescript
enum WorkerStatus {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  ERROR = 'ERROR',
  TERMINATING = 'TERMINATING',
}

enum OperationType {
  MATRIX_MULTIPLY, MATRIX_TRANSPOSE, MATRIX_ADD, MATRIX_SUBTRACT,
  MATRIX_DETERMINANT, MATRIX_INVERSE,
  STATS_MEAN, STATS_SUM, STATS_MIN, STATS_MAX,
  STATS_VARIANCE, STATS_STD, STATS_MEDIAN,
}
```

**Key Interfaces:**
- `WorkerRequest` - Message to worker
- `WorkerResponse` - Message from worker
- `WorkerPoolConfig` - Pool configuration
- `WorkerPoolStats` - Pool statistics
- `WorkerMetadata` - Worker instance metadata
- `Task` - Queued task
- `DataChunk<T>` - Chunked data for parallel ops
- `ChunkOptions` - Chunking configuration

**Type Guards:**
```typescript
function isSuccessResponse(response): response is WorkerResponseSuccess
function isErrorResponse(response): response is WorkerResponseError
function isMatrixOperationData(data): data is MatrixOperationData
function isStatsOperationData(data): data is StatsOperationData
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - High-level architecture
- [OVERFLOW.md](OVERFLOW.md) - Queue overflow and backpressure
- [DATAFLOW.md](DATAFLOW.md) - Data flow patterns
- [OVERVIEW.md](OVERVIEW.md) - User guide
