# Math MCP Server - Architecture Guide

This document provides a comprehensive overview of the Math MCP Server codebase architecture, file organization, and key design patterns.

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Directory Structure](#directory-structure)
3. [Core Modules](#core-modules)
4. [Multi-Tier Acceleration System](#multi-tier-acceleration-system)
5. [Worker Infrastructure](#worker-infrastructure)
6. [Security Layer](#security-layer)
7. [Telemetry & Observability](#telemetry--observability)
8. [Data Flow](#data-flow)
9. [Key Design Patterns](#key-design-patterns)

---

## High-Level Architecture

```
                    ┌─────────────────────────────────────────┐
                    │              MCP Client                 │
                    │     (Claude Desktop, Claude CLI)        │
                    └───────────────────┬─────────────────────┘
                                        │ stdio
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          MCP Server Layer                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │  index-wasm.ts  │  │  tool-handlers  │  │     rate-limiter.ts     │   │
│  │  (Entry Point)  │  │    .ts          │  │   (Token Bucket DoS)    │   │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘   │
│           │                    │                                          │
│           ▼                    ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    Acceleration Router                               │ │
│  │              (acceleration-router.ts)                                │ │
│  │   Routes operations through optimal tier based on input size         │ │
│  └──────────┬───────────┬───────────────┬────────────────┬─────────────┘ │
└─────────────┼───────────┼───────────────┼────────────────┼───────────────┘
              │           │               │                │
              ▼           ▼               ▼                ▼
       ┌──────────┐ ┌──────────┐  ┌─────────────┐  ┌──────────────┐
       │  mathjs  │ │   WASM   │  │  WebWorkers │  │   WebGPU     │
       │  (small) │ │ (medium) │  │   (large)   │  │  (future)   │
       │   <10    │ │  10-100  │  │  100-500    │  │   (future)   │
       └──────────┘ └──────────┘  └─────────────┘  └──────────────┘
                         │               │
                         ▼               ▼
              ┌─────────────────────────────────────────┐
              │        AssemblyScript WASM Modules       │
              │   wasm/assembly/ (matrix, statistics)    │
              └─────────────────────────────────────────┘
```

---

## Directory Structure

```
math-mcp/
├── src/                          # TypeScript source code
│   ├── index-wasm.ts             # Main entry point (production)
│   ├── index.ts                  # Basic entry point (no acceleration)
│   ├── mathjs-shim.ts            # Single import surface for mathjs fork
│   ├── types.ts                  # Shared type definitions (AccelerationWrapper, etc.)
│   │
│   │── # Core Infrastructure
│   ├── acceleration-router.ts    # Tier-based routing logic
│   ├── acceleration-adapter.ts   # Clean adapter interface
│   ├── acceleration-router-compat.ts # Backward compatibility layer
│   ├── wasm-wrapper.ts           # WASM integration with lazy loading
│   ├── wasm-executor.ts          # WASM operation execution
│   ├── wasm-integrity.ts         # SHA-256 integrity verification
│   │
│   │── # Tool Implementation
│   ├── tool-handlers.ts          # 7 mathematical tool handlers
│   ├── handler-utils.ts          # Handler utility functions
│   │
│   │── # Validation & Security
│   ├── validation.ts             # Input validation (DoS prevention)
│   ├── errors.ts                 # Custom error types
│   ├── rate-limiter.ts           # Token bucket rate limiting
│   │
│   │── # Caching & Performance
│   ├── expression-cache.ts       # LRU cache for parsed expressions
│   ├── routing-utils.ts          # Routing statistics & utilities
│   ├── degradation-policy.ts     # Graceful degradation handling
│   │
│   │── # Utilities
│   ├── utils.ts                  # Logging, performance tracking
│   ├── shared/
│   │   ├── constants.ts          # Shared constants
│   │   └── logger.ts             # Logging configuration
│   │
│   │── # Worker Infrastructure
│   ├── workers/
│   │   ├── worker-pool.ts        # Dynamic worker pool manager
│   │   ├── pool-manager.ts       # Worker pool lifecycle
│   │   ├── task-queue.ts         # Priority-based task scheduling
│   │   ├── math-worker.ts        # Worker thread implementation
│   │   ├── parallel-matrix.ts    # Parallel matrix operations
│   │   ├── parallel-stats.ts     # Parallel statistics operations
│   │   ├── parallel-executor.ts  # Generic parallel framework
│   │   ├── chunk-utils.ts        # Data chunking utilities
│   │   ├── backpressure.ts       # Queue overflow strategies
│   │   └── worker-types.ts       # Type definitions
│   │
│   │── # Telemetry
│   ├── telemetry/
│   │   ├── metrics.ts            # Prometheus metrics collection
│   │   └── server.ts             # HTTP telemetry server (port 9090)
│   │
│   │── # Health Checks
│   ├── health.ts                 # Kubernetes-compatible probes
│   │
│   └── gpu/
│       └── webgpu-wrapper.ts     # WebGPU acceleration (future)
│
├── wasm/                         # WebAssembly modules
│   ├── assembly/                 # AssemblyScript source
│   │   ├── matrix/               # Matrix operations
│   │   └── statistics/           # Statistical operations
│   ├── bindings/                 # JavaScript bindings
│   │   ├── matrix.cjs            # Matrix WASM bindings
│   │   └── statistics.cjs        # Statistics WASM bindings
│   ├── build/                    # Compiled WASM binaries
│   │   ├── release.wasm          # Production build
│   │   └── debug.wasm            # Debug build
│   ├── tests/                    # WASM unit tests
│   └── benchmarks/               # Performance benchmarks
│
├── test/                         # Test suites
│   ├── integration-test.js       # Integration tests (11 tests)
│   ├── correctness-tests.js      # Mathematical correctness
│   ├── unit/                     # Unit tests (Vitest)
│   │   ├── telemetry/
│   │   ├── health.test.ts
│   │   ├── backpressure.test.ts
│   │   ├── handler-utils.test.ts
│   │   ├── routing-utils.test.ts
│   │   ├── mathjs-shim.test.ts
│   │   ├── acceleration-adapter.test.ts
│   │   ├── wasm-executor.test.ts
│   │   └── wasm-integrity.test.ts
│   └── security/                 # Security tests (119 tests)
│       ├── injection.test.ts
│       ├── dos.test.ts
│       ├── fuzzing.test.ts
│       └── bounds.test.ts
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md           # This file
│   ├── OVERVIEW.md               # User guide
│   ├── ACCELERATION_ARCHITECTURE.md
│   ├── planning/                 # Planning documents
│   └── code-review/              # Code review reports
│
├── scripts/                      # Build & utility scripts
│   ├── generate-wasm-hashes.js   # WASM hash generation
│   └── check-dependencies.js     # Dependency validation
│
├── dist/                         # Compiled JavaScript output
├── wasm-hashes.json              # WASM integrity hashes
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
├── eslint.config.js              # ESLint flat config
└── CHANGELOG.md                  # Version history
```

---

## Core Modules

### Entry Points

| File | Purpose |
|------|---------|
| `src/index-wasm.ts` | **Production entry point** with multi-tier acceleration |
| `src/index.ts` | Basic entry point using only mathjs (no acceleration) |

### `index-wasm.ts` - Main Server

The main entry point that:
1. Creates the MCP server with tool definitions
2. Registers request handlers for 7 mathematical tools
3. Connects via stdio transport
4. Routes operations through the acceleration adapter
5. Starts the telemetry server (no-op unless `ENABLE_TELEMETRY=true`) and registers SIGINT/SIGTERM handlers to stop it cleanly

```typescript
// Key components:
const TOOLS: Tool[] = [...];  // 7 tool definitions
async function createServer(): Promise<Server> { ... }
function registerHandlers(server: Server): void { ... }
async function main(): Promise<void> { ... }
```

### `tool-handlers.ts` - Business Logic

Implements the 7 mathematical tools:

| Tool | Function | Acceleration |
|------|----------|--------------|
| `evaluate` | `handleEvaluate()` | mathjs |
| `simplify` | `handleSimplify()` | mathjs |
| `derivative` | `handleDerivative()` | mathjs |
| `solve` | `handleSolve()` | mathjs |
| `matrix_operations` | `handleMatrixOperations()` | WASM/Workers |
| `statistics` | `handleStatistics()` | WASM/Workers |
| `unit_conversion` | `handleUnitConversion()` | mathjs |

Each handler:
- Validates input using `validation.ts`
- Applies timeout protection
- Routes to acceleration layer (matrix/stats)
- Returns formatted MCP response

### `acceleration-router.ts` - Intelligent Routing

The `AccelerationRouter` class routes operations through optimal tiers:

```typescript
class AccelerationRouter {
  // Configuration & worker pool management
  constructor(config: AccelerationRouterConfig, workerPool?: WorkerPool)
  async initialize(): Promise<void>
  async shutdown(): Promise<void>

  // Matrix operations with tier selection
  async matrixMultiply(a, b): Promise<{ result, tier }>
  async matrixTranspose(matrix): Promise<{ result, tier }>
  async matrixAdd(a, b): Promise<{ result, tier }>
  async matrixSubtract(a, b): Promise<{ result, tier }>

  // Statistics operations with tier selection
  async statsMean(data): Promise<{ result, tier }>
  // ... other stats operations

  // Statistics
  getRoutingStats()
  resetRoutingStats()
}
```

**Tier Selection Logic:**
```
GPU      → shouldUseGPU()           # Currently disabled (Node.js)
Workers  → shouldUseParallel(size)  # size >= 100 for matrices
WASM     → size >= THRESHOLDS.xxx   # 10+ for matrices, 100+ for stats
mathjs   → fallback                 # Always available
```

### `wasm-wrapper.ts` - WASM Integration

Provides lazy-loading WASM operations with automatic fallback:

```typescript
// Lazy initialization (thread-safe)
export async function ensureWasmInitialized(): Promise<void>

// Matrix operations
export async function matrixMultiply(a, b): Promise<number[][]>
export async function matrixDeterminant(matrix): Promise<number>
export async function matrixTranspose(matrix): Promise<number[][]>
export async function matrixAdd(a, b): Promise<number[][]>
export async function matrixSubtract(a, b): Promise<number[][]>

// Statistics operations
export async function statsMean(data): Promise<number>
export async function statsMedian(data): Promise<number>
export async function statsStd(data): Promise<number>
export async function statsVariance(data): Promise<number>
export async function statsMin(data): Promise<number>
export async function statsMax(data): Promise<number>
export async function statsSum(data): Promise<number>
export async function statsMode(data): Promise<number | number[]>
export async function statsProduct(data): Promise<number>

// Performance tracking
export function getPerfStats(): PerfStats
```

**Thresholds (benchmarked values):**
```typescript
THRESHOLDS = {
  matrix_multiply: 10,   // 8x speedup at 10x10
  matrix_det: 5,         // 17x speedup at 5x5
  matrix_transpose: 20,  // 2x speedup at 20x20
  matrix_add_sub: 20,    // threshold for matrix add/subtract
  statistics: 100,       // 15-42x speedup at 100+ elements
  median: 50,            // Lower due to sorting
}
```

---

## Multi-Tier Acceleration System

### Tier Hierarchy

| Tier | Technology | Use Case | Speedup |
|------|------------|----------|---------|
| **GPU** | WebGPU | Massive data (500+) | Up to 1920x (future) |
| **Workers** | worker_threads | Large data (100-500) | Up to 32x |
| **WASM** | AssemblyScript | Medium data (10-100) | Up to 42x |
| **mathjs** | Pure JS | Small data (<10) | Baseline |

### Fallback Chain

```
GPU → Workers → WASM → mathjs
```

If any tier fails, the system gracefully falls back to the next tier. mathjs is always available as the final fallback.

### WASM Module Architecture

```
wasm/
├── assembly/              # AssemblyScript source
│   ├── index.ts           # Main entry
│   ├── matrix/
│   │   ├── multiply.ts
│   │   ├── transpose.ts
│   │   ├── determinant.ts
│   │   ├── add.ts
│   │   └── subtract.ts
│   └── statistics/
│       ├── mean.ts
│       ├── median.ts
│       ├── std.ts
│       ├── variance.ts
│       ├── min.ts
│       ├── max.ts
│       ├── sum.ts
│       ├── mode.ts
│       └── product.ts
├── bindings/              # JavaScript bindings
│   ├── matrix.cjs
│   └── statistics.cjs
└── build/
    ├── release.wasm       # Optimized production build
    └── debug.wasm         # Debug build with symbols
```

**Build command:** `npm run build:wasm` (or `cd wasm && npm run asbuild`)

---

## Worker Infrastructure

### `worker-pool.ts` - Pool Manager

The `WorkerPool` class manages a dynamic pool of worker threads:

```typescript
class WorkerPool {
  constructor(config?: WorkerPoolConfig)

  async initialize(): Promise<void>
  async execute<T>(request: WorkerRequest): Promise<T>
  async shutdown(gracePeriod?: number): Promise<void>

  getStats(): WorkerPoolStats
  isInitialized(): boolean
  getAvailableWorkerCount(): number
  getPendingTaskCount(): number
}
```

**Configuration:**
```typescript
interface WorkerPoolConfig {
  maxWorkers: number;         // Default: CPU cores - 1
  minWorkers: number;         // Default: 2 (0 for auto-scaling)
  workerIdleTimeout: number;  // Default: 60000ms
  taskTimeout: number;        // Default: 30000ms
  maxQueueSize: number;       // Default: 1000
  enablePerformanceTracking: boolean;
}
```

### `task-queue.ts` - Priority Queue

Manages task scheduling with priority support:
- Priority-based ordering
- Timeout handling
- Task lifecycle (pending → active → completed/failed)

### `parallel-executor.ts` - Generic Framework

Type-safe generic framework for parallel operations:

```typescript
interface ParallelOperationConfig<TInput, TChunk, TResult> {
  name: string;
  operationType: OperationType;
  minChunkSize: number;
  chunk: (input, numChunks) => ChunkData<TChunk>[];
  createRequest: (chunk, input) => Record<string, unknown>;
  merge: (results, input, chunks) => TResult;
}

async function executeParallel<TInput, TChunk, TResult>(
  config: ParallelOperationConfig<TInput, TChunk, TResult>,
  input: TInput,
  pool: WorkerPool,
  inputSize: number
): Promise<TResult>

// Utility functions
function chunkArray<T>(data: T[], numChunks: number): ChunkData<T[]>[]
function chunkMatrixRows(matrix: number[][], numChunks: number): ChunkData<number[][]>[]
function mergeSum(results: number[]): number
function mergeMin(results: number[]): number
function mergeMax(results: number[]): number
```

### `backpressure.ts` - Queue Overflow

Three strategies for handling queue overflow:

| Strategy | Behavior |
|----------|----------|
| `REJECT` | Fast fail when at capacity |
| `WAIT` | Queue with timeout |
| `SHED` | Drop oldest tasks |

---

## Security Layer

### `validation.ts` - Input Validation

Comprehensive validation to prevent attacks:

```typescript
// Limits
LIMITS = {
  MAX_MATRIX_SIZE: 1000,        // 1000x1000 max
  MAX_ARRAY_LENGTH: 100000,     // 100K elements
  MAX_EXPRESSION_LENGTH: 10000, // 10K characters
  MAX_NESTING_DEPTH: 50,        // Parentheses depth
  MAX_VARIABLE_NAME_LENGTH: 100,
  MAX_SCOPE_VARIABLES: 100,
}

// Validation functions
function safeJsonParse<T>(jsonString, context): T
function validateMatrix(data, context): number[][]
function validateSquareMatrix(matrix, context): number[][]
function validateMatrixSize(matrix, context): number[][]
function validateMatrixCompatibility(a, b, operation): void
function validateNumberArray(data, context): number[]
function validateArrayLength(array, context): number[]
function validateExpression(expression, context): string
function validateVariableName(name, context): string
function validateScope(scope, context): Record<string, number>
function validateEnum<T>(value, allowed, context): T
```

### `rate-limiter.ts` - Token Bucket

Prevents DoS attacks with token bucket algorithm:
- Configurable requests per time window
- Concurrent request limits
- Queue size limits

### `wasm-integrity.ts` - WASM Verification

SHA-256 cryptographic verification of WASM binaries:
- Verifies module integrity at load time via `fs.existsSync` checks against binding files
- Prevents execution of tampered modules
- Automatic fallback on integrity failure

### Expression Sandboxing

The `tool-handlers.ts` implements AST validation:
- Whitelist of allowed node types
- Forbidden function blocking (`import`, `eval`, `Function`, etc.)
- Assignment operation blocking

---

## Telemetry & Observability

### `telemetry/metrics.ts` - Prometheus Metrics

Collects production-grade metrics:
- Operation duration histograms
- Operation counters (by type, tier, status)
- Queue size gauges
- Worker count gauges
- Rate limit hits
- Cache hit/miss rates

### `telemetry/server.ts` - HTTP Server

HTTP server on port 9090:
- `GET /metrics` - Prometheus text format
- `GET /metrics/json` - JSON format
- `GET /health` - Health status

### `health.ts` - Health Checks

Kubernetes-compatible health probes:

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

// Endpoints
GET /health       - Overall health
GET /health/live  - Liveness probe
GET /health/ready - Readiness probe
```

---

## Data Flow

### Request Flow

```
1. MCP Client sends tool call request via stdio
                     │
                     ▼
2. index-wasm.ts receives request
   - Parses tool name and arguments
   - Applies rate limiting
                     │
                     ▼
3. tool-handlers.ts validates input
   - Type checking
   - Size limits
   - Expression sandboxing
                     │
                     ▼
4. acceleration-adapter.ts routes operation
   - Checks input size
   - Selects optimal tier
                     │
                     ▼
5. Execution tier processes request
   ┌─────────────────┼─────────────────┐
   │                 │                 │
   ▼                 ▼                 ▼
 mathjs           WASM           Workers
 (small)         (medium)        (large)
   │                 │                 │
   └─────────────────┼─────────────────┘
                     │
                     ▼
6. Result formatted and returned via MCP
```

### Worker Task Flow

```
1. Operation request arrives
                     │
                     ▼
2. shouldUseParallel(size) check
   - If false → WASM fallback
   - If true → continue
                     │
                     ▼
3. parallel-*.ts chunks data
   - Divide into numWorkers chunks
   - Create chunk metadata
                     │
                     ▼
4. WorkerPool.execute() for each chunk
   - Task added to queue
   - Worker assigned
   - Request sent to worker
                     │
                     ▼
5. math-worker.ts processes chunk
   - Loads WASM module
   - Executes operation
   - Returns result
                     │
                     ▼
6. Results merged
   - Combine chunk results
   - Apply merge strategy
                     │
                     ▼
7. Final result returned
```

---

## Key Design Patterns

### 1. Dependency Injection

The `AccelerationRouter` supports dependency injection for testing:

```typescript
// Default usage
const router = new AccelerationRouter();

// With injected worker pool
const pool = new WorkerPool(customConfig);
const router = new AccelerationRouter(config, pool);
```

### 2. Lazy Initialization

WASM modules load on-demand:

```typescript
let wasmInitPromise: Promise<void> | null = null;

export async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;
  if (!wasmInitPromise) {
    wasmInitPromise = initWASM();
  }
  await wasmInitPromise;
}
```

### 3. Graceful Degradation

Fallback chain ensures reliability:

```typescript
const tiers: TierExecutor[] = [
  { tier: GPU,     shouldUse: () => ..., execute: () => ... },
  { tier: WORKERS, shouldUse: () => ..., execute: () => ... },
  { tier: WASM,    shouldUse: () => ..., execute: () => ... },
];

return routeWithFallback({ tiers, fallback: mathjsFn }, stats);
```

### 4. Configuration via Environment

All major settings configurable:

```bash
# Logging
LOG_LEVEL=debug|info|warn|error

# Acceleration
ENABLE_GPU=true
ENABLE_WORKERS=true
ENABLE_WASM=true

# Worker pool
MIN_WORKERS=0      # Auto-scaling
MAX_WORKERS=8
WORKER_IDLE_TIMEOUT=60000
TASK_TIMEOUT=30000

# Security
MAX_MATRIX_SIZE=1000
MAX_ARRAY_LENGTH=100000
MAX_EXPRESSION_LENGTH=10000

# Telemetry
ENABLE_TELEMETRY=true
```

### 5. Type Safety

Strict TypeScript with generics:

```typescript
interface ParallelOperationConfig<TInput, TChunk, TResult extends WorkerResult> {
  name: string;
  chunk: (input: TInput, numChunks: number) => ChunkData<TChunk>[];
  merge: (results: TResult[], input: TInput) => TResult;
}
```

### 6. Single mathjs Import Surface

All source files import mathjs through the shim rather than directly from the package:

```typescript
// All src/ files use:
import math from './mathjs-shim.js';

// The shim unwraps the local fork's default export and retypes the namespace,
// providing the full mathjs surface (parse, simplify, det, etc.)
```

The `AccelerationWrapper` interface is defined in `src/types.ts` and re-exported from `tool-handlers.ts` for backward compatibility. The function-style API (`routedMatrixMultiply`, `getRoutingStats`, etc.) is imported directly from `./acceleration-router-compat.js` by consumers that need it.

---

## Related Documentation

- [OVERVIEW.md](OVERVIEW.md) - User guide and getting started
- [ACCELERATION_ARCHITECTURE.md](ACCELERATION_ARCHITECTURE.md) - Detailed acceleration guide
- [../CHANGELOG.md](../CHANGELOG.md) - Version history
- [../CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
