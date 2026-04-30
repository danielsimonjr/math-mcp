# Math MCP Server - Project Overview

A comprehensive overview of the Math MCP Server codebase, architecture, and key systems.

## Table of Contents

1. [Project Summary](#project-summary)
2. [Architecture at a Glance](#architecture-at-a-glance)
3. [Core Systems](#core-systems)
4. [Multi-Tier Acceleration](#multi-tier-acceleration)
5. [Worker Infrastructure](#worker-infrastructure)
6. [Security & Protection](#security--protection)
7. [Observability](#observability)
8. [Directory Structure](#directory-structure)
9. [Key Files Reference](#key-files-reference)
10. [Configuration](#configuration)

---

## Project Summary

**Math MCP Server** is a high-performance Model Context Protocol (MCP) server that provides mathematical computation capabilities to AI assistants like Claude.

| Property | Value |
|----------|-------|
| **Version** | 3.5.0 |
| **Runtime** | Node.js >= 18 |
| **Protocol** | MCP (Model Context Protocol) |
| **Transport** | stdio |
| **Language** | TypeScript |
| **Acceleration** | WASM + WebWorkers |

### Key Capabilities

| Capability | Description | Speedup |
|------------|-------------|---------|
| Expression Evaluation | Arithmetic, algebra, calculus | - |
| Symbolic Math | Simplification, derivatives, equation solving | - |
| Matrix Operations | Multiply, inverse, determinant, transpose | Up to 32x |
| Statistics | Mean, median, std, variance, min, max | Up to 143x |
| Unit Conversion | Length, mass, time, temperature, etc. | - |

### Design Principles

1. **Performance First** - Multi-tier acceleration with automatic routing
2. **Security by Default** - Input validation, rate limiting, expression sandboxing
3. **Graceful Degradation** - Automatic fallback from GPU → Workers → WASM → mathjs
4. **Production Ready** - Health checks, metrics, structured logging

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP CLIENT                                  │
│                  (Claude Desktop / CLI)                             │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ stdio
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      MCP SERVER LAYER                               │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────────┐  │
│  │ index-wasm   │  │ tool-handlers │  │     rate-limiter        │  │
│  │ (7 tools)    │  │ (business)    │  │   (DoS protection)      │  │
│  └──────┬───────┘  └───────┬───────┘  └─────────────────────────┘  │
└─────────┼──────────────────┼────────────────────────────────────────┘
          │                  │
          ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ACCELERATION LAYER                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              acceleration-router                              │  │
│  │   Routes operations to optimal tier based on input size       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│         │              │              │              │              │
│         ▼              ▼              ▼              ▼              │
│    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐          │
│    │  GPU    │   │ Workers │   │  WASM   │   │ mathjs  │          │
│    │(future) │   │ (large) │   │(medium) │   │ (small) │          │
│    └─────────┘   └─────────┘   └─────────┘   └─────────┘          │
└─────────────────────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   WORKER INFRASTRUCTURE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ worker-pool │  │ task-queue  │  │ backpressure│                 │
│  │ (dynamic)   │  │ (priority)  │  │ (overflow)  │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Core Systems

### 1. MCP Server (`index-wasm.ts`)

The main entry point that:
- Creates the MCP server instance
- Registers 7 mathematical tools
- Connects via stdio transport
- Coordinates rate limiting and acceleration
- Starts the telemetry server after transport connects (no-op unless `ENABLE_TELEMETRY=true`)

**7 Registered Tools:**

| Tool | Handler | Accelerated |
|------|---------|-------------|
| `evaluate` | `handleEvaluate()` | No |
| `simplify` | `handleSimplify()` | No |
| `derivative` | `handleDerivative()` | No |
| `solve` | `handleSolve()` | No |
| `matrix_operations` | `handleMatrixOperations()` | Yes |
| `statistics` | `handleStatistics()` | Yes |
| `unit_conversion` | `handleUnitConversion()` | No |

### 2. Tool Handlers (`tool-handlers.ts`)

Business logic implementation with:
- Input validation via `validation.ts`
- Expression sandboxing (AST whitelist)
- Timeout protection
- Acceleration routing for matrix/stats

```typescript
// Handler pattern
export async function handleToolName(
  params: ToolParams,
  accelerator?: AccelerationWrapper
): Promise<MCP_Response>
```

The `AccelerationWrapper` interface is defined in `src/types.ts`; `tool-handlers.ts` re-exports it for backward compatibility.

### 3. Validation (`validation.ts`)

Comprehensive input validation:

| Limit | Value | Purpose |
|-------|-------|---------|
| `MAX_MATRIX_SIZE` | 1000 | Prevent memory exhaustion |
| `MAX_ARRAY_LENGTH` | 100,000 | Prevent DoS |
| `MAX_EXPRESSION_LENGTH` | 10,000 | Prevent parsing overhead |
| `MAX_NESTING_DEPTH` | 50 | Prevent stack overflow |

### 4. Error Hierarchy (`errors.ts`)

```
MathMCPError (base)
├── ValidationError
│   ├── SizeLimitError
│   └── ComplexityError
├── WasmError
├── TimeoutError
├── RateLimitError
└── BackpressureError
```

---

## Multi-Tier Acceleration

### Tier Hierarchy

```
Performance
    ▲
    │   ┌─────────────────────────────────────┐
    │   │  GPU (WebGPU) - Future              │  Up to 1920x
    │   │  Massive data (500+ matrices)       │
    │   ├─────────────────────────────────────┤
    │   │  Workers (worker_threads)           │  Up to 32x
    │   │  Large data (100-500 matrices)      │
    │   ├─────────────────────────────────────┤
    │   │  WASM (AssemblyScript)              │  Up to 42x
    │   │  Medium data (10-100 matrices)      │
    │   ├─────────────────────────────────────┤
    │   │  mathjs (Pure JavaScript)           │  Baseline
    │   │  Small data (<10 matrices)          │
    │   └─────────────────────────────────────┘
    └──────────────────────────────────────────▶ Data Size
```

### Automatic Routing

The `AccelerationRouter` automatically selects the optimal tier:

```typescript
// Threshold-based routing
if (matrixSize >= 100) → Workers
else if (matrixSize >= 10) → WASM
else → mathjs

// Fallback chain on failure
GPU → Workers → WASM → mathjs
```

### WASM Thresholds

| Operation | WASM Threshold | Speedup |
|-----------|----------------|---------|
| Matrix Multiply | 10x10 | 8x |
| Matrix Determinant | 5x5 | 17x |
| Matrix Add/Subtract | 20x20 | 2x |
| Matrix Transpose | 20x20 | 2x |
| Statistics (mean, std, etc.) | 100 elements | 15-42x |

### Function-Style API

The function-style API (`routedMatrixMultiply`, `getRoutingStats`, etc.) is imported directly from `./acceleration-router-compat.js`. Consumers should not rely on the router module re-exporting these functions.

### Lazy Loading (v3.4.0)

- WASM modules load on first use (not at startup)
- Thread-safe concurrent initialization
- GPU module uses dynamic import
- Reduces cold start time

---

## Worker Infrastructure

### Worker Pool

Dynamic pool of worker threads for parallel operations:

```
┌──────────────────────────────────────────────────────────────┐
│                      WORKER POOL                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │Worker 0 │ │Worker 1 │ │Worker 2 │ │Worker N │            │
│  │  BUSY   │ │  IDLE   │ │  BUSY   │ │  IDLE   │            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘            │
│                                                              │
│  Configuration:                                              │
│  • Min workers: 2 (configurable, 0 for auto-scaling)        │
│  • Max workers: CPU cores - 1                               │
│  • Idle timeout: 60 seconds                                 │
│  • Task timeout: 30 seconds                                 │
└──────────────────────────────────────────────────────────────┘
```

### Task Queue

Priority-based scheduling:

```
High Priority ─────────────────────────▶ Low Priority

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ Priority │  │ Priority │  │ Priority │  │ Priority │
│    10    │  │    5     │  │    5     │  │    0     │
│  (FIFO)  │  │  (FIFO)  │  │  (FIFO)  │  │  (FIFO)  │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

### Backpressure Strategies

When queues overflow:

| Strategy | Behavior | Best For |
|----------|----------|----------|
| **REJECT** | Fail fast with retry hint | Low-latency APIs |
| **WAIT** | Block until space (timeout) | Batch processing |
| **SHED** | Drop lowest priority | Mixed workloads |

### Parallel Operations

Data is chunked across workers:

```
Input: 1000x1000 matrix
           │
           ▼
    ┌──────────────┐
    │   Chunking   │  Split into N chunks
    └──────────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌────────┐   ┌────────┐
│Worker 1│   │Worker N│   Process in parallel
│Rows 0- │   │Rows N- │
│  499   │   │  999   │
└────────┘   └────────┘
    │             │
    └──────┬──────┘
           ▼
    ┌──────────────┐
    │    Merge     │  Combine results
    └──────────────┘
           │
           ▼
    Result: computed matrix
```

---

## Security & Protection

### Input Validation

```typescript
// All inputs validated before processing
validateMatrix(data, context)      // 2D array of numbers
validateMatrixSize(matrix, ctx)    // Size limits
validateExpression(expr, ctx)      // Length, nesting
validateScope(scope, ctx)          // Variable safety
```

### Expression Sandboxing

```typescript
// Forbidden functions blocked
const BLOCKED = ['import', 'evaluate', 'parse', 'compile', 'help', 'Function'];

// AST whitelist enforced
const ALLOWED_NODES = [
  'ConstantNode', 'OperatorNode', 'FunctionNode',
  'SymbolNode', 'ParenthesisNode', ...
];
```

### Rate Limiting

Token bucket algorithm:

```
┌─────────────────────────┐
│  Token Bucket           │
│  ┌───────────────────┐  │
│  │ ░░░░░░░░░░░░░░░░░ │  │ Max: 100 tokens
│  │ ░░░░ TOKENS ░░░░░ │  │ Refill: ~1.67/sec
│  │ ░░░░░░░░░░░░░░░░░ │  │
│  └───────────────────┘  │
│          │              │
│    1 token per request  │
└─────────────────────────┘

Defaults:
• 100 requests per minute
• 10 concurrent max
• 50 queued max
```

### WASM Integrity

SHA-256 verification of WASM binaries:
- Prevents execution of tampered modules
- Automatic fallback on integrity failure
- Can be disabled for development
- Checks for binding-file existence via `fs.existsSync` at health-check time

---

## Observability

### Health Checks

Kubernetes-compatible probes:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Full health status |
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness probe |

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

### Prometheus Metrics

Available at `GET /metrics` (port 9090):

| Metric | Type | Description |
|--------|------|-------------|
| `math_mcp_operation_duration_seconds` | Histogram | Operation latency |
| `math_mcp_operation_total` | Counter | Total operations |
| `math_mcp_queue_size` | Gauge | Queue depths |
| `math_mcp_workers` | Gauge | Worker counts |
| `math_mcp_rate_limit_hits_total` | Counter | Rate limit triggers |
| `math_mcp_errors_total` | Counter | Error counts |

### Logging

Structured JSON logging with levels:

```bash
LOG_LEVEL=debug|info|warn|error
```

---

## Directory Structure

```
math-mcp/
├── src/                          # TypeScript source
│   ├── index-wasm.ts             # Main entry point
│   ├── index.ts                  # Basic entry (no acceleration)
│   │
│   ├── # Core
│   ├── tool-handlers.ts          # Tool business logic
│   ├── handler-utils.ts          # Handler utilities
│   ├── errors.ts                 # Error types
│   ├── types.ts                  # Shared type definitions (AccelerationWrapper, etc.)
│   ├── mathjs-shim.ts            # Single mathjs import surface
│   │
│   ├── # Acceleration
│   ├── acceleration-router.ts    # Tier routing
│   ├── acceleration-router-compat.ts  # Function-style API (routedMatrixMultiply, etc.)
│   ├── acceleration-adapter.ts   # Clean adapter
│   ├── wasm-wrapper.ts           # WASM integration
│   ├── wasm-executor.ts          # WASM execution
│   ├── degradation-policy.ts     # Fallback policy
│   ├── routing-utils.ts          # Routing utilities
│   │
│   ├── # Security
│   ├── validation.ts             # Input validation
│   ├── rate-limiter.ts           # Token bucket
│   ├── wasm-integrity.ts         # WASM verification
│   │
│   ├── # Caching
│   ├── expression-cache.ts       # LRU cache
│   │
│   ├── # Workers
│   ├── workers/
│   │   ├── worker-pool.ts        # Pool manager
│   │   ├── task-queue.ts         # Priority queue
│   │   ├── backpressure.ts       # Overflow handling
│   │   ├── parallel-matrix.ts    # Parallel matrix ops
│   │   ├── parallel-stats.ts     # Parallel stats
│   │   ├── parallel-executor.ts  # Generic framework
│   │   ├── math-worker.ts        # Worker thread
│   │   ├── chunk-utils.ts        # Chunking
│   │   └── worker-types.ts       # Type definitions
│   │
│   ├── # Telemetry
│   ├── health.ts                 # Health checks
│   └── telemetry/
│       ├── metrics.ts            # Prometheus metrics
│       └── server.ts             # HTTP server
│
├── wasm/                         # WASM modules
│   ├── assembly/                 # AssemblyScript source
│   ├── bindings/                 # JS bindings
│   └── build/                    # Compiled .wasm
│
├── test/                         # Tests
│   ├── integration-test.js       # Integration (11 tests)
│   ├── correctness-tests.js      # Math correctness
│   ├── unit/                     # Unit tests
│   └── security/                 # Security tests (119)
│
├── docs/                         # Documentation
│   ├── OVERVIEW.md               # This file
│   ├── ARCHITECTURE.md           # Architecture details
│   ├── COMPONENTS.md             # Component reference
│   └── USER_GUIDE.md             # User guide
│
└── dist/                         # Compiled output
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/index-wasm.ts` | Production entry point |
| `src/tool-handlers.ts` | Tool business logic |
| `src/types.ts` | Shared interfaces (`AccelerationWrapper`, etc.) |
| `src/mathjs-shim.ts` | Single mathjs import surface |
| `src/acceleration-router.ts` | Tier-based routing |
| `src/acceleration-router-compat.ts` | Function-style routing API |
| `src/wasm-wrapper.ts` | WASM operations |
| `src/validation.ts` | Input validation |
| `src/rate-limiter.ts` | DoS protection |
| `src/workers/worker-pool.ts` | Worker management |
| `src/workers/task-queue.ts` | Priority scheduling |
| `src/workers/backpressure.ts` | Overflow handling |
| `src/health.ts` | Health checks |
| `src/telemetry/metrics.ts` | Prometheus metrics |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | info | Logging level |
| `ENABLE_WORKERS` | true | Enable worker tier |
| `ENABLE_WASM` | true | Enable WASM tier |
| `ENABLE_TELEMETRY` | false | Enable telemetry/metrics server |
| `MIN_WORKERS` | 2 | Minimum workers |
| `MAX_WORKERS` | CPU-1 | Maximum workers |
| `TASK_TIMEOUT` | 30000 | Task timeout (ms) |
| `MAX_MATRIX_SIZE` | 1000 | Max matrix dimension |
| `MAX_ARRAY_LENGTH` | 100000 | Max array elements |
| `MAX_REQUESTS_PER_WINDOW` | 100 | Rate limit |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Rate window |
| `MAX_CONCURRENT_REQUESTS` | 10 | Max concurrent |
| `EXPRESSION_CACHE_SIZE` | 1000 | Cache entries |

### Running the Server

```bash
# Production (with acceleration)
node dist/index-wasm.js

# Basic (mathjs only)
node dist/index.js

# With debug logging
LOG_LEVEL=debug node dist/index-wasm.js

# With performance logging
ENABLE_PERF_LOGGING=true node dist/index-wasm.js
```

### Dependencies

The project uses a local mathjs fork (`file:../Mathjs`, danielsimonjr/mathjs v15.2.0). Use `npm install` rather than `npm ci`; `package-lock.json` is gitignored.

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Detailed architecture
- [COMPONENTS.md](COMPONENTS.md) - Component reference
- [USER_GUIDE.md](USER_GUIDE.md) - User guide and examples
- [../CHANGELOG.md](../CHANGELOG.md) - Version history
