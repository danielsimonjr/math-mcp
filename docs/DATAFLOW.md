# Math MCP Server - Data Flow Guide

Documentation of data flow patterns, request lifecycle, and processing pipelines in the Math MCP Server.

## Table of Contents

1. [Request Lifecycle](#request-lifecycle)
2. [Tool Request Flow](#tool-request-flow)
3. [Error Flow](#error-flow)
4. [Caching Flow](#caching-flow)
5. [Metrics Flow](#metrics-flow)

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
     │    │ 5. Execute via   │                   │                   │
     │    │    MathTS        │                   │                   │
     │    └────────┬─────────┘                   │                   │
     │             │                              │                   │
     │             ▼                              │                   │
     │    ┌──────────────────┐                   │                   │
     │    │ 6. Format Result │                   │                   │
     │    └────────┬─────────┘                   │                   │
     │             │                              │                   │
     │             └──────────────┬──────────────┘                   │
     │                            │                                   │
     │                            ▼                                   │
     │                   ┌──────────────────┐                        │
     │                   │ 7. MCP Response  │◀───────────────────────┘
     │                   └────────┬─────────┘
     │                            │
     │  8. Tool Response (stdio)  │
     │  ◀─────────────────────────┘
     │
```

### Lifecycle Stages

| Stage | Component | Action |
|-------|-----------|--------|
| 1 | MCP SDK | Receive tool call over stdio |
| 2 | rate-limiter.ts | Check token bucket, concurrent limits |
| 3 | index.ts | Parse tool name and arguments |
| 4 | validation.ts | Validate input types, sizes, content |
| 5 | math-engine.ts (MathTS) | Execute the mathematical operation |
| 6 | tool-handlers.ts | Format result for MCP response |
| 7 | MCP SDK | Send response over stdio |

There is no acceleration/tier-routing stage — MathTS performs the computation directly, and large-input protection is enforced entirely by the size limits checked at stage 4 (`src/validation.ts`), not by timeouts or a fallback chain (synchronous JS can't be interrupted mid-operation).

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
         │ MathTS evaluate  │
         │ with scope       │
         │ (math-engine.ts) │
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
         │ Execute via      │
         │ MathTS           │
         │ (math-engine.ts) │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Format Result    │
         │ { result: [[]] } │
         └──────────────────┘
```

Note: large dense matrices run slower under MathTS's JS matrix multiply than the old WASM path did; there is no acceleration tier to fall back to. Size limits (`MAX_MATRIX_SIZE`, default 1000x1000) bound the input rather than a timeout.

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
         │ Execute via      │
         │ MathTS           │
         │ (math-engine.ts) │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Format Result    │
         │ { result: 50000 }│
         └──────────────────┘
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
    ┌────────┼────────┬────────┐
    ▼        ▼        ▼        ▼
Validation Timeout  RateLimit  Other
  Error     Error     Error   MathMCPError
    │        │        │        │
    ▼        ▼        ▼        ▼
┌────────────────────────────────────────────────────┐
│              Error Handling                        │
│              (handler-utils.ts)                    │
│                                                    │
│  • Log error with context (logger.error)          │
│  • Format as an MCP error response                │
│                                                    │
└───────────────────────┬────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │ Return Error     │
              │ Response         │
              │                  │
              │ {isError: true,  │
              │  content: [...]} │
              └──────────────────┘
```

`withErrorHandling` (`handler-utils.ts`) wraps every handler call: any thrown error is caught and converted directly to an error response via `errorResponse()` — there is no recoverable/fallback branch (no acceleration tier to downgrade to).

### Error Response Format

```typescript
// MCP Error Response — content[0].text is JSON.stringify({ error, errorType })
{
  content: [
    {
      type: "text",
      text: '{"error": "Matrix size 2000x2000 exceeds maximum of 1000x1000", "errorType": "SizeLimitError"}'
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
│ GET /metrics     │      │ GET /health      │
│ (Prometheus fmt) │      │ (JSON status)    │
└──────────────────┘      └──────────────────┘


Periodic Updates:

┌──────────────────┐     ┌──────────────────┐
│ Cache Stats      │────▶│ Update cache     │
│                  │     │ gauges           │
└──────────────────┘     └──────────────────┘
```

---

## Related Documentation

- [COMPONENTS.md](COMPONENTS.md) - Component reference
- [USER_GUIDE.md](USER_GUIDE.md) - User guide
