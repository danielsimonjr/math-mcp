# Math MCP Server - Data Flow Guide

Documentation of data flow patterns, request lifecycle, and processing pipelines in the Math MCP Server.

## Table of Contents

1. [Request Lifecycle](#request-lifecycle)
2. [Tool Request Flow](#tool-request-flow)
3. [Acceleration Routing Flow](#acceleration-routing-flow)
4. [Worker Task Flow](#worker-task-flow)
5. [Parallel Processing Flow](#parallel-processing-flow)
6. [Error Flow](#error-flow)
7. [Caching Flow](#caching-flow)
8. [Metrics Flow](#metrics-flow)

---

## Request Lifecycle

Complete lifecycle of an MCP request from client to response:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      REQUEST LIFECYCLE                              │
└─────────────────────────────────────────────────────────────────────┘

 MCP Client                Math MCP Server
     │
     │  1. Tool Call Request (stdio)
     │  ─────────────────────────────▶
     │                                    ┌──────────────────────┐
     │                                    │ 2. Rate Limit Check  │
     │                                    └──────────┬───────────┘
     │                                               │
     │                              ┌────────────────┴────────────────┐
     │                              ▼                                 ▼
     │                         ALLOWED                            REJECTED
     │                              │                                 │
     │                              ▼                                 │
     │                    ┌──────────────────┐                       │
     │                    │ 3. Parse Request │                       │
     │                    └────────┬─────────┘                       │
     │                             │                                  │
     │                             ▼                                  │
     │                    ┌──────────────────┐                       │
     │                    │ 4. Validate Input│                       │
     │                    └────────┬─────────┘                       │
     │                             │                                  │
     │              ┌──────────────┴──────────────┐                  │
     │              ▼                             ▼                   │
     │           VALID                        INVALID                │
     │              │                             │                   │
     │              ▼                             │                   │
     │    ┌──────────────────┐                   │                   │
     │    │ 5. Route to Tier │                   │                   │
     │    └────────┬─────────┘                   │                   │
     │             │                              │                   │
     │             ▼                              │                   │
     │    ┌──────────────────┐                   │                   │
     │    │ 6. Execute       │                   │                   │
     │    │    Operation     │                   │                   │
     │    └────────┬─────────┘                   │                   │
     │             │                              │                   │
     │             ▼                              │                   │
     │    ┌──────────────────┐                   │                   │
     │    │ 7. Format Result │                   │                   │
     │    └────────┬─────────┘                   │                   │
     │             │                              │                   │
     │             └──────────────┬──────────────┘                   │
     │                            │                                   │
     │                            ▼                                   │
     │                   ┌──────────────────┐                        │
     │                   │ 8. MCP Response  │◀───────────────────────┘
     │                   └────────┬─────────┘
     │                            │
     │  9. Tool Response (stdio)  │
     │  ◀─────────────────────────┘
     │
```

### Lifecycle Stages

| Stage | Component | Action |
|-------|-----------|--------|
| 1 | MCP SDK | Receive tool call over stdio |
| 2 | rate-limiter.ts | Check token bucket, concurrent limits |
| 3 | index-wasm.ts | Parse tool name and arguments |
| 4 | validation.ts | Validate input types, sizes, content |
| 5 | acceleration-router.ts | Select optimal execution tier |
| 6 | wasm-wrapper.ts / workers | Execute mathematical operation |
| 7 | tool-handlers.ts | Format result for MCP response |
| 8 | MCP SDK | Send response over stdio |

---

## Tool Request Flow

Detailed flow for each tool type:

### Expression Tools (evaluate, simplify, derivative, solve)

```
Request: evaluate("x^2 + 2*x", {x: 3})
                    │
                    ▼
         ┌──────────────────┐
         │ validateExpression│
         │ validateScope     │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Check Expression │
         │     Cache        │
         └────────┬─────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
    CACHE HIT           CACHE MISS
        │                   │
        │                   ▼
        │          ┌──────────────────┐
        │          │ Parse & Compile  │
        │          │    Expression    │
        │          └────────┬─────────┘
        │                   │
        │                   ▼
        │          ┌──────────────────┐
        │          │  Sandbox Check   │
        │          │  (AST Whitelist) │
        │          └────────┬─────────┘
        │                   │
        └─────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ mathjs.evaluate  │
         │ with scope       │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Format Result    │
         │ { result: 15 }   │
         └──────────────────┘
```

### Matrix Operations Flow

```
Request: matrix_operations("multiply", matrixA, matrixB)
                    │
                    ▼
         ┌──────────────────┐
         │ Parse JSON       │
         │ matrices         │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ validateMatrix   │
         │ validateSize     │
         │ validateCompat   │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Check Size for   │
         │ Tier Selection   │
         └────────┬─────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    ▼             ▼             ▼             ▼
 < 10x10      10-100x100    100-500x500    > 500x500
    │             │             │             │
    ▼             ▼             ▼             ▼
 mathjs        WASM         Workers        (GPU)
    │             │             │             │
    └─────────────┴─────────────┴─────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Format Result    │
         │ { result: [[]] } │
         └──────────────────┘
```

### Statistics Flow

```
Request: statistics("mean", [1, 2, 3, ..., 100000])
                    │
                    ▼
         ┌──────────────────┐
         │ Parse JSON array │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ validateArray    │
         │ validateLength   │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Check Size for   │
         │ Tier Selection   │
         └────────┬─────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
  < 100       100-100K       > 100K
    │             │             │
    ▼             ▼             ▼
 mathjs        WASM         Workers
    │             │             │
    └─────────────┴─────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Format Result    │
         │ { result: 50000 }│
         └──────────────────┘
```

---

## Acceleration Routing Flow

How the acceleration router selects the optimal tier:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ACCELERATION ROUTING                             │
└─────────────────────────────────────────────────────────────────────┘

Operation Request
        │
        ▼
┌──────────────────┐
│ Calculate Input  │
│ Size (elements)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Check GPU Tier   │────▶│ GPU Enabled?     │
└────────┬─────────┘     │ Size >= 500?     │
         │               │ GPU Available?   │
         │               └────────┬─────────┘
         │                        │
         │               ┌────────┴────────┐
         │               ▼                 ▼
         │             YES               NO
         │               │                 │
         │               ▼                 │
         │        ┌────────────┐          │
         │        │  Try GPU   │          │
         │        └──────┬─────┘          │
         │               │                 │
         │        ┌──────┴──────┐         │
         │        ▼             ▼         │
         │     SUCCESS       FAIL        │
         │        │             │         │
         │        │             └─────────┼──────┐
         │        │                       │      │
         ▼        │                       ▼      │
┌──────────────────┐     ┌──────────────────┐   │
│ Check Workers    │────▶│ Workers Enabled? │   │
│ Tier             │     │ Size >= 100?     │   │
└────────┬─────────┘     │ Pool Ready?      │   │
         │               └────────┬─────────┘   │
         │                        │             │
         │               ┌────────┴────────┐   │
         │               ▼                 ▼   │
         │             YES               NO    │
         │               │                 │   │
         │               ▼                 │   │
         │        ┌────────────┐          │   │
         │        │Try Workers │          │   │
         │        └──────┬─────┘          │   │
         │               │                 │   │
         │        ┌──────┴──────┐         │   │
         │        ▼             ▼         │   │
         │     SUCCESS       FAIL        │   │
         │        │             │         │   │
         │        │             └─────────┼───┤
         │        │                       │   │
         ▼        │                       ▼   │
┌──────────────────┐     ┌──────────────────┐ │
│ Check WASM       │────▶│ WASM Enabled?    │ │
│ Tier             │     │ Size >= threshold│ │
└────────┬─────────┘     │ WASM Ready?      │ │
         │               └────────┬─────────┘ │
         │                        │           │
         │               ┌────────┴────────┐ │
         │               ▼                 ▼ │
         │             YES               NO  │
         │               │                 │ │
         │               ▼                 │ │
         │        ┌────────────┐          │ │
         │        │  Try WASM  │          │ │
         │        └──────┬─────┘          │ │
         │               │                 │ │
         │        ┌──────┴──────┐         │ │
         │        ▼             ▼         │ │
         │     SUCCESS       FAIL        │ │
         │        │             │         │ │
         │        │             └─────────┼─┤
         │        │                       │ │
         ▼        │                       ▼ ▼
┌──────────────────┐     ┌──────────────────┐
│ mathjs Fallback  │◀────│ Always Available │
└────────┬─────────┘     └──────────────────┘
         │
         ▼
    Return Result
    with Tier Used
```

### Routing Statistics

```typescript
interface RoutingStats {
  mathjsUsage: number;   // Small data operations
  wasmUsage: number;     // Medium data operations
  workersUsage: number;  // Large data operations
  gpuUsage: number;      // Massive data operations
}
```

---

## Worker Task Flow

How tasks flow through the worker infrastructure:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      WORKER TASK FLOW                               │
└─────────────────────────────────────────────────────────────────────┘

Operation Request
        │
        ▼
┌──────────────────┐
│ Create Task      │
│ {id, operation,  │
│  data, priority} │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Enqueue Task     │──────────────┐
└────────┬─────────┘              │
         │                        │
         ▼                        ▼
┌──────────────────┐    ┌──────────────────┐
│ Queue Full?      │───▶│ Apply Backpressure│
└────────┬─────────┘    │ (REJECT/WAIT/SHED)│
         │NO            └──────────────────┘
         ▼
┌──────────────────┐
│ Insert by        │
│ Priority Order   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Schedule to      │
│ Idle Worker      │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Worker receives  │────▶│ Load WASM module │
│ task via message │     │ (if not loaded)  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └────────────────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Execute Operation│
         │ (matrix/stats)   │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Send Result      │
         │ Back to Main     │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Complete Task    │
         │ Resolve Promise  │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Worker → IDLE    │
         │ Schedule Next    │
         └──────────────────┘
```

### Task States

```
                    ┌─────────────┐
        enqueue()   │             │
 ─────────────────▶ │   PENDING   │
                    │             │
                    └──────┬──────┘
                           │ scheduleNext()
                           ▼
                    ┌─────────────┐
                    │             │
                    │   ACTIVE    │
                    │             │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  COMPLETED  │  │   FAILED    │  │  TIMED OUT  │
   └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Parallel Processing Flow

How data is distributed and merged across workers:

```
┌─────────────────────────────────────────────────────────────────────┐
│                   PARALLEL MATRIX MULTIPLY                          │
└─────────────────────────────────────────────────────────────────────┘

Input: Matrix A (1000x1000) × Matrix B (1000x1000)
                    │
                    ▼
         ┌──────────────────┐
         │ Determine Chunks │
         │ = min(workers,   │
         │   rows/minSize)  │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Chunk Matrix A   │
         │ by rows          │
         └────────┬─────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    ▼             ▼             ▼             ▼
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│Chunk 0 │   │Chunk 1 │   │Chunk 2 │   │Chunk 3 │
│Rows    │   │Rows    │   │Rows    │   │Rows    │
│0-249   │   │250-499 │   │500-749 │   │750-999 │
└───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘
    │            │            │            │
    ▼            ▼            ▼            ▼
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│Worker 0│   │Worker 1│   │Worker 2│   │Worker 3│
│        │   │        │   │        │   │        │
│chunk × │   │chunk × │   │chunk × │   │chunk × │
│full B  │   │full B  │   │full B  │   │full B  │
└───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘
    │            │            │            │
    ▼            ▼            ▼            ▼
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│Result  │   │Result  │   │Result  │   │Result  │
│Rows    │   │Rows    │   │Rows    │   │Rows    │
│0-249   │   │250-499 │   │500-749 │   │750-999 │
└───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘
    │            │            │            │
    └─────────────┴─────────────┴─────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Merge Results   │
         │  Concatenate rows│
         └────────┬─────────┘
                  │
                  ▼
         Result: 1000x1000 matrix
```

### Parallel Statistics Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                   PARALLEL MEAN CALCULATION                         │
└─────────────────────────────────────────────────────────────────────┘

Input: Array of 1,000,000 elements
                    │
                    ▼
         ┌──────────────────┐
         │ Chunk Array      │
         │ into N parts     │
         └────────┬─────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┐
    ▼             ▼             ▼             ▼
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│Chunk 0 │   │Chunk 1 │   │Chunk 2 │   │Chunk 3 │
│Elements│   │Elements│   │Elements│   │Elements│
│0-249K  │   │250K-   │   │500K-   │   │750K-   │
│        │   │499K    │   │749K    │   │999K    │
└───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘
    │            │            │            │
    ▼            ▼            ▼            ▼
┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐
│Worker 0│   │Worker 1│   │Worker 2│   │Worker 3│
│        │   │        │   │        │   │        │
│sum:    │   │sum:    │   │sum:    │   │sum:    │
│12.5M   │   │12.6M   │   │12.4M   │   │12.5M   │
│count:  │   │count:  │   │count:  │   │count:  │
│250K    │   │250K    │   │250K    │   │250K    │
└───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘
    │            │            │            │
    └─────────────┴─────────────┴─────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Merge Results   │
         │  total_sum /     │
         │  total_count     │
         └────────┬─────────┘
                  │
                  ▼
         Result: mean = 50.0
```

---

## Error Flow

How errors propagate through the system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ERROR FLOW                                  │
└─────────────────────────────────────────────────────────────────────┘

         Error Occurs
              │
              ▼
     ┌────────────────┐
     │ Classify Error │
     └───────┬────────┘
             │
    ┌────────┼────────┬────────┬────────┬────────┐
    ▼        ▼        ▼        ▼        ▼        ▼
 Validation  WASM   Timeout   Rate    Back-    Worker
   Error    Error   Error    Limit  pressure   Error
    │        │        │        │        │        │
    ▼        ▼        ▼        ▼        ▼        ▼
┌────────────────────────────────────────────────────┐
│              Error Handling                        │
│                                                    │
│  • Log error with context                         │
│  • Record metrics (error type, operation)         │
│  • Determine if recoverable                       │
│                                                    │
└───────────────────────┬────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
   RECOVERABLE                    NON-RECOVERABLE
        │                               │
        ▼                               ▼
┌──────────────────┐           ┌──────────────────┐
│ Fallback Action  │           │ Return Error     │
│ • Tier downgrade │           │ Response         │
│ • Retry          │           │                  │
│ • Default value  │           │ {isError: true,  │
└────────┬─────────┘           │  content: [...]} │
         │                     └──────────────────┘
         ▼
    Continue with
    fallback result
```

### Error Response Format

```typescript
// MCP Error Response
{
  content: [
    {
      type: "text",
      text: "ValidationError: Matrix size 2000x2000 exceeds maximum of 1000x1000"
    }
  ],
  isError: true
}
```

---

## Caching Flow

Expression cache hit/miss flow:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       CACHING FLOW                                  │
└─────────────────────────────────────────────────────────────────────┘

Expression Request: "x^2 + 2*x + 1"
                    │
                    ▼
         ┌──────────────────┐
         │ Generate Cache   │
         │ Key (expr+scope) │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Lookup in LRU    │
         │ Cache            │
         └────────┬─────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
     CACHE HIT         CACHE MISS
         │                 │
         ▼                 ▼
┌──────────────────┐  ┌──────────────────┐
│ Update lastUsed  │  │ Parse Expression │
│ Return compiled  │  │ Compile to AST   │
└────────┬─────────┘  └────────┬─────────┘
         │                     │
         │                     ▼
         │            ┌──────────────────┐
         │            │ Store in Cache   │
         │            │ (evict LRU if    │
         │            │  at capacity)    │
         │            └────────┬─────────┘
         │                     │
         └──────────┬──────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ Evaluate with    │
         │ scope variables  │
         └────────┬─────────┘
                  │
                  ▼
            Return Result
```

### Cache Statistics

```typescript
interface CacheStats {
  size: number;      // Current entries
  maxSize: number;   // Capacity (1000)
  hits: number;      // Cache hits
  misses: number;    // Cache misses
  hitRate: number;   // hits / (hits + misses)
}
```

---

## Metrics Flow

How metrics are collected and exposed:

```
┌─────────────────────────────────────────────────────────────────────┐
│                       METRICS FLOW                                  │
└─────────────────────────────────────────────────────────────────────┘

Operation Execution
        │
        ├──────────────────────────────────────────┐
        │                                          │
        ▼                                          ▼
┌──────────────────┐                    ┌──────────────────┐
│ Record Duration  │                    │ Record Counter   │
│ (Histogram)      │                    │ (success/error)  │
└────────┬─────────┘                    └────────┬─────────┘
         │                                       │
         └───────────────┬───────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │ Prometheus       │
              │ Registry         │
              │                  │
              │ • Histograms     │
              │ • Counters       │
              │ • Gauges         │
              └────────┬─────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌──────────────────┐      ┌──────────────────┐
│ GET /metrics     │      │ GET /metrics/json│
│ (Prometheus fmt) │      │ (JSON format)    │
└──────────────────┘      └──────────────────┘


Periodic Updates:

┌──────────────────┐     ┌──────────────────┐
│ Worker Pool      │────▶│ Update worker    │
│ Stats            │     │ gauges           │
└──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│ Queue Stats      │────▶│ Update queue     │
│                  │     │ gauges           │
└──────────────────┘     └──────────────────┘

┌──────────────────┐     ┌──────────────────┐
│ Cache Stats      │────▶│ Update cache     │
│                  │     │ gauges           │
└──────────────────┘     └──────────────────┘
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [COMPONENTS.md](COMPONENTS.md) - Component reference
- [OVERVIEW.md](OVERVIEW.md) - Project overview
- [USER_GUIDE.md](USER_GUIDE.md) - User guide
