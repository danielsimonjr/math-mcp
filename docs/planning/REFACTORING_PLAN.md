# Math MCP Refactoring Plan - WebWorkers & Advanced WASM

**Version:** 3.0.0 (Planned)
**Date:** November 18, 2025
**Goal:** Maximize performance through WebWorkers, advanced WASM, and TypeScript optimization

---

## Executive Summary

This document outlines the plan to refactor the Math MCP server beyond its current WASM implementation to achieve:

1. **Parallel Processing** - WebWorkers for multi-threaded mathematical operations
2. **Enhanced WASM** - Additional WASM modules for missing operations
3. **TypeScript Optimization** - Pure TypeScript implementations where WASM overhead isn't justified
4. **Performance Target** - 10-100x speedup for parallelizable operations

---

## Current State Analysis

### ✅ Already Implemented (v2.1.0)

#### WASM Modules (AssemblyScript)
**Matrix Operations:**
- ✅ Multiply (8x speedup @ 10×10+)
- ✅ Determinant (17x speedup @ 5×5+)
- ✅ Transpose (2x speedup @ 20×20+)
- ✅ Add (3-5x speedup @ 20×20+)
- ✅ Subtract (3-5x speedup @ 20×20+)

**Statistics Operations:**
- ✅ Mean (15x speedup @ 100+ elements)
- ✅ Median (10-20x speedup @ 50+ elements)
- ✅ Mode (10-20x speedup @ 100+ elements)
- ✅ Std Deviation (30x speedup @ 100+ elements)
- ✅ Variance (35x speedup @ 100+ elements)
- ✅ Min (41x speedup @ 100+ elements)
- ✅ Max (42x speedup @ 100+ elements)
- ✅ Sum (15-20x speedup @ 100+ elements)
- ✅ Product (15-20x speedup @ 100+ elements)

**Current Coverage:** ~60% of performance-critical operations

### ❌ NOT Implemented (Opportunities)

#### Missing WASM Operations
1. **Matrix Inverse** - Complex but high value (used in solving linear systems)
2. **Matrix Eigenvalues** - Very complex (iterative algorithms)
3. **LU Decomposition** - Foundation for many operations
4. **QR Decomposition** - Used in eigenvalue calculations
5. **Cholesky Decomposition** - For positive definite matrices

#### Symbolic Math (Cannot WASM-ify easily)
- Expression parsing
- Symbolic simplification
- Derivative calculation
- Equation solving
These rely on mathjs's symbolic engine and are not good WASM candidates.

#### Unit Conversion (Not worth WASM-ifying)
- Simple lookups and multiplications
- mathjs already optimized for this

---

## Analysis of Mathjs Usage

### Current Dependencies

```typescript
// From tool-handlers.ts analysis:

// EXPRESSION/SYMBOLIC (Cannot parallelize)
math.evaluate()      // Used in: handleEvaluate
math.simplify()      // Used in: handleSimplify
math.derivative()    // Used in: handleDerivative
math.parse()         // Used in: handleSolve
math.format()        // Used everywhere for output

// MATRIX OPERATIONS (Parallelizable)
math.multiply()      // ✅ WASM available
math.det()           // ✅ WASM available
math.transpose()     // ✅ WASM available
math.add()           // ✅ WASM available
math.subtract()      // ✅ WASM available
math.inv()           // ❌ NO WASM (needed!)
math.eigs()          // ❌ NO WASM (complex)

// STATISTICS (Parallelizable)
math.mean()          // ✅ WASM available
math.median()        // ✅ WASM available
math.mode()          // ✅ WASM available
math.std()           // ✅ WASM available
math.variance()      // ✅ WASM available
math.min()           // ✅ WASM available
math.max()           // ✅ WASM available
math.sum()           // ✅ WASM available
math.prod()          // ✅ WASM available (via statsProduct)

// UNIT CONVERSION (Not critical)
math.unit()          // Used in: handleUnitConversion
```

### Performance Characteristics

**Current WASM Implementation:**
- **Architecture:** AssemblyScript → WASM
- **Memory Management:** JavaScript-managed (TypedArrays)
- **Parallelization:** None (single-threaded)
- **Routing:** Threshold-based (size-dependent)

**Strengths:**
- Clean abstraction with automatic fallback
- Well-documented with JSDoc
- Good threshold selection (empirically tested)
- Zero overhead for small operations

**Weaknesses:**
- Single-threaded (no parallelization)
- Missing some important matrix operations
- No batching support for multiple operations

---

## Phase 1: WebWorker Architecture Design

### Goals
- Parallel processing for large operations
- Minimal overhead for small operations
- Graceful degradation if workers unavailable
- Pool-based worker management

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread (Node.js)                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           MCP Server (index-wasm.ts)                   │ │
│  │                        │                               │ │
│  │                        ▼                               │ │
│  │           Tool Handlers (tool-handlers.ts)             │ │
│  │                        │                               │ │
│  │                        ▼                               │ │
│  │      ┌─────────────────────────────────────────┐      │ │
│  │      │    Worker Pool Manager                  │      │ │
│  │      │  - Manages 4-8 worker threads           │      │ │
│  │      │  - Load balancing                       │      │ │
│  │      │  - Task queuing                         │      │ │
│  │      └─────────────────┬───────────────────────┘      │ │
│  │                        │                               │ │
│  │          ┌─────────────┼─────────────┐                │ │
│  │          ▼             ▼             ▼                │ │
│  │     Worker 1      Worker 2      Worker N              │ │
│  │     (WASM)        (WASM)        (WASM)                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

Each Worker:
  - Loads WASM modules independently
  - Processes chunk of data
  - Returns results to main thread
```

### Worker Pool Design

**File Structure:**
```
src/
├── workers/
│   ├── worker-pool.ts          # Pool manager
│   ├── math-worker.ts          # Worker implementation
│   ├── task-queue.ts           # Task scheduling
│   └── worker-types.ts         # Shared types
├── wasm-parallel/
│   ├── parallel-matrix.ts      # Parallel matrix ops
│   ├── parallel-stats.ts       # Parallel statistics
│   └── chunk-utils.ts          # Data chunking utilities
```

**Key Components:**

1. **WorkerPool** - Manages worker lifecycle
   ```typescript
   class WorkerPool {
     private workers: Worker[];
     private taskQueue: TaskQueue;
     private maxWorkers: number;

     async executeParallel<T>(
       operation: string,
       data: any,
       chunkSize?: number
     ): Promise<T>;

     async shutdown(): Promise<void>;
   }
   ```

2. **TaskQueue** - Fair scheduling and load balancing
   ```typescript
   class TaskQueue {
     private queue: Task[];
     private activeWorkers: Map<Worker, Task>;

     enqueue(task: Task): void;
     getNext(): Task | null;
     onWorkerAvailable(worker: Worker): void;
   }
   ```

3. **MathWorker** - Worker thread implementation
   ```typescript
   // Runs in worker thread
   import * as wasmMatrix from '../wasm/bindings/matrix.cjs';
   import * as wasmStats from '../wasm/bindings/statistics.cjs';

   onmessage = async (event: MessageEvent) => {
     const { operation, data, id } = event.data;

     try {
       const result = await processOperation(operation, data);
       postMessage({ id, result, success: true });
     } catch (error) {
       postMessage({ id, error: error.message, success: false });
     }
   };
   ```

### Parallel Operation Strategies

#### 1. Matrix Multiplication (Block-Based Parallelization)

**Current:** Single-threaded WASM
**New:** Parallel blocked multiplication

```typescript
/**
 * Parallel matrix multiplication using worker pool
 *
 * Algorithm:
 * 1. Split matrix A into row blocks
 * 2. Each worker computes a subset of result rows
 * 3. Combine results in main thread
 *
 * Example: 1000×1000 matrix with 4 workers
 * - Worker 1: Rows 0-249
 * - Worker 2: Rows 250-499
 * - Worker 3: Rows 500-749
 * - Worker 4: Rows 750-999
 *
 * Expected speedup: 3-4x (with 4 workers)
 */
async function parallelMatrixMultiply(
  a: number[][],
  b: number[][],
  workerPool: WorkerPool
): Promise<number[][]>;
```

#### 2. Statistics (Data-Parallel)

**Current:** Single-threaded WASM
**New:** Parallel chunk processing

```typescript
/**
 * Parallel mean calculation
 *
 * Algorithm:
 * 1. Split data into N chunks (one per worker)
 * 2. Each worker calculates sum and count for its chunk
 * 3. Main thread combines: total_sum / total_count
 *
 * Example: 1M elements with 4 workers
 * - Worker 1: Elements 0-249,999
 * - Worker 2: Elements 250,000-499,999
 * - Worker 3: Elements 500,000-749,999
 * - Worker 4: Elements 750,000-999,999
 *
 * Expected speedup: 3.5-4x (with 4 workers)
 */
async function parallelStatsMean(
  data: number[],
  workerPool: WorkerPool
): Promise<number>;
```

### When to Use Workers?

**Decision Matrix:**

| Operation         | Size Threshold | Strategy          | Expected Speedup |
|-------------------|----------------|-------------------|------------------|
| Matrix Multiply   | 100×100+       | Block-based       | 3-4x (4 workers) |
| Matrix Transpose  | 200×200+       | Block-based       | 2-3x (4 workers) |
| Statistics Mean   | 100,000+       | Chunk-based       | 3.5-4x           |
| Statistics Median | 100,000+       | Chunk sort+merge  | 2-3x             |
| Statistics StdDev | 100,000+       | Chunk-based       | 3-4x             |

**Routing Logic:**
```
┌─────────────────┐
│  Small data?    │──Yes──▶ Use mathjs (no overhead)
└────────┬────────┘
         │ No
         ▼
┌─────────────────┐
│ Medium data?    │──Yes──▶ Use WASM (single-threaded)
└────────┬────────┘
         │ No
         ▼
┌─────────────────┐
│  Large data?    │──Yes──▶ Use WebWorkers + WASM (parallel)
└─────────────────┘
```

---

## Phase 2: Additional WASM Implementations

### Priority 1: Matrix Inverse

**Implementation:** Gauss-Jordan Elimination
**Expected Speedup:** 10-15x for 50×50+ matrices
**Complexity:** Medium

```typescript
// wasm/assembly/matrix/inverse.ts
export function inverseGaussJordan(
  a: usize,      // Input matrix pointer
  result: usize, // Output matrix pointer
  size: i32      // Matrix dimension
): i32;          // Returns: 0 = success, 1 = singular matrix
```

**Algorithm:**
1. Create augmented matrix [A | I]
2. Row reduce to [I | A⁻¹]
3. Extract inverse from right side

### Priority 2: LU Decomposition

**Implementation:** Doolittle's method with partial pivoting
**Expected Speedup:** 8-12x for 50×50+ matrices
**Complexity:** Medium

```typescript
// wasm/assembly/matrix/decomposition.ts
export function luDecompose(
  a: usize,      // Input matrix pointer
  l: usize,      // L matrix output
  u: usize,      // U matrix output
  p: usize,      // Permutation matrix output
  size: i32      // Matrix dimension
): i32;          // Returns: 0 = success, 1 = singular
```

**Use Cases:**
- Solving Ax = b
- Computing determinant
- Matrix inversion

### Priority 3: QR Decomposition

**Implementation:** Householder reflections
**Expected Speedup:** 6-10x for 50×50+ matrices
**Complexity:** High

```typescript
// wasm/assembly/matrix/decomposition.ts
export function qrDecompose(
  a: usize,      // Input matrix pointer
  q: usize,      // Q matrix output (orthogonal)
  r: usize,      // R matrix output (upper triangular)
  rows: i32,     // Number of rows
  cols: i32      // Number of columns
): void;
```

**Use Cases:**
- Least squares solutions
- Eigenvalue computation
- Orthonormalization

---

## Phase 3: TypeScript Optimizations

### Pure TypeScript Implementations

For some operations, pure TypeScript might be faster than WASM due to:
- No serialization overhead
- V8's JIT optimization
- Simpler memory management

**Candidates:**

1. **Small Matrix Operations (< 10×10)**
   - Current: mathjs
   - New: Optimized TypeScript with typed arrays
   - Expected speedup: 2-3x over mathjs

2. **Streaming Statistics**
   - Current: Batch processing only
   - New: Online algorithms for incremental updates
   - Use case: Real-time data processing

3. **Memoization Layer**
   - Cache common calculations
   - LRU cache for expensive operations
   - Expected hit rate: 20-30% for typical workloads

### Example: Optimized Small Matrix Multiply

```typescript
/**
 * Optimized TypeScript matrix multiply for small matrices
 * Faster than WASM for sizes < 10×10 due to no serialization overhead
 */
function fastSmallMatrixMultiply(
  a: Float64Array,
  b: Float64Array,
  result: Float64Array,
  size: number
): void {
  // Unrolled for common sizes
  if (size === 2) {
    // 2×2 - fully unrolled
    result[0] = a[0] * b[0] + a[1] * b[2];
    result[1] = a[0] * b[1] + a[1] * b[3];
    result[2] = a[2] * b[0] + a[3] * b[2];
    result[3] = a[2] * b[1] + a[3] * b[3];
    return;
  }

  // General case with cache-friendly access pattern
  for (let i = 0; i < size; i++) {
    const rowOffset = i * size;
    for (let j = 0; j < size; j++) {
      let sum = 0;
      for (let k = 0; k < size; k++) {
        sum += a[rowOffset + k] * b[k * size + j];
      }
      result[rowOffset + j] = sum;
    }
  }
}
```

---

## Phase 4: Implementation Roadmap

### Week 1: WebWorker Foundation
- [ ] Create worker pool manager
- [ ] Implement task queue
- [ ] Create math worker implementation
- [ ] Add data chunking utilities
- [ ] Write unit tests for worker pool

### Week 2: Parallel Matrix Operations
- [ ] Implement parallel matrix multiply
- [ ] Implement parallel matrix transpose
- [ ] Add matrix inverse (WASM)
- [ ] Benchmark and tune thresholds
- [ ] Integration tests

### Week 3: Parallel Statistics
- [ ] Implement parallel mean/sum
- [ ] Implement parallel min/max
- [ ] Implement parallel variance/std
- [ ] Implement parallel median (merge-based)
- [ ] Benchmark and tune

### Week 4: Advanced WASM
- [ ] Implement LU decomposition
- [ ] Implement QR decomposition
- [ ] Optimize existing WASM (SIMD if available)
- [ ] Add comprehensive benchmarks

### Week 5: TypeScript Optimizations
- [ ] Optimize small matrix operations
- [ ] Add streaming statistics
- [ ] Implement memoization layer
- [ ] Performance profiling

### Week 6: Integration & Testing
- [ ] Update tool-handlers for new routing
- [ ] Comprehensive integration tests
- [ ] Performance regression tests
- [ ] Update documentation
- [ ] Version 3.0.0 release

---

## Performance Targets

### Current (v2.1.0)
| Operation         | Size      | Time (ms) | Method      |
|-------------------|-----------|-----------|-------------|
| Matrix Multiply   | 100×100   | 45        | WASM        |
| Matrix Multiply   | 1000×1000 | 35,000    | WASM        |
| Statistics Mean   | 100K      | 2.5       | WASM        |
| Statistics Mean   | 1M        | 25        | WASM        |

### Target (v3.0.0 with WebWorkers)
| Operation         | Size      | Target (ms) | Method           | Speedup |
|-------------------|-----------|-------------|------------------|---------|
| Matrix Multiply   | 100×100   | 12          | Workers + WASM   | 3.75x   |
| Matrix Multiply   | 1000×1000 | 8,750       | Workers + WASM   | 4x      |
| Statistics Mean   | 100K      | 0.7         | Workers + WASM   | 3.5x    |
| Statistics Mean   | 1M        | 6.5         | Workers + WASM   | 3.85x   |

**Overall Target:** 3-4x speedup for large parallelizable operations

---

## Technical Considerations

### 1. Memory Management

**Challenge:** Workers require data serialization
**Solution:** Use SharedArrayBuffer where possible

```typescript
// Instead of copying data:
worker.postMessage({ data: largeArray }); // ❌ Copies data

// Use shared memory:
const sharedBuffer = new SharedArrayBuffer(size * 8);
const sharedArray = new Float64Array(sharedBuffer);
worker.postMessage({ buffer: sharedBuffer }); // ✅ No copy
```

### 2. Worker Overhead

**Challenge:** Worker creation is expensive
**Solution:** Worker pool with persistent workers

```typescript
// ❌ Creating worker per operation (slow)
const worker = new Worker('./math-worker.js');

// ✅ Reuse worker pool
const result = await workerPool.execute(operation, data);
```

### 3. Load Balancing

**Challenge:** Uneven work distribution
**Solution:** Dynamic work stealing

```typescript
// If worker finishes early, steal work from others
class TaskQueue {
  onWorkerIdle(worker: Worker): void {
    const task = this.stealWork();
    if (task) worker.postMessage(task);
  }
}
```

### 4. Error Handling

**Challenge:** Worker errors are isolated
**Solution:** Robust error reporting and fallback

```typescript
try {
  result = await workerPool.execute(operation, data);
} catch (error) {
  logger.warn('Worker failed, falling back to WASM');
  result = await wasmWrapper.execute(operation, data);
}
```

---

## Testing Strategy

### Unit Tests
- Worker pool creation and shutdown
- Task queue ordering
- Data chunking correctness
- WASM module correctness

### Integration Tests
- End-to-end operation execution
- Fallback mechanisms
- Error handling

### Performance Tests
- Benchmark all operation sizes
- Compare: mathjs vs WASM vs Workers
- Memory usage profiling
- Regression testing

### Load Tests
- Concurrent operations
- Worker pool saturation
- Memory limits

---

## Documentation Requirements

### User-Facing
- Update README with v3.0.0 features
- Performance comparison charts
- Configuration guide for worker count
- Migration guide from v2.x

### Developer-Facing
- Worker architecture diagrams
- WASM implementation guides
- Contributing guidelines for new operations
- Benchmarking methodology

---

## Success Metrics

### Performance
- ✅ 3-4x speedup for large matrix operations
- ✅ 3-4x speedup for large statistical operations
- ✅ < 5% overhead for small operations
- ✅ Linear scaling with worker count (up to CPU cores)

### Quality
- ✅ 100% test coverage for new code
- ✅ Zero breaking changes in API
- ✅ All operations have graceful fallback
- ✅ Comprehensive documentation

### Reliability
- ✅ No memory leaks in worker pool
- ✅ Proper worker cleanup on shutdown
- ✅ Error rates < 0.1%
- ✅ Recovery from worker crashes

---

## Risk Assessment

### High Risk
- **Worker Support:** Not all Node.js environments support worker_threads
  - **Mitigation:** Graceful fallback to WASM/mathjs

### Medium Risk
- **Memory Overhead:** Parallel processing uses more memory
  - **Mitigation:** Configurable worker count, memory limits

- **Complexity:** More moving parts = more potential bugs
  - **Mitigation:** Comprehensive testing, good monitoring

### Low Risk
- **Performance Regression:** Workers might be slower for some cases
  - **Mitigation:** Careful threshold tuning, benchmarking

---

## Appendix A: Alternative Approaches Considered

### 1. GPU Acceleration (WebGPU)
**Pros:** Massive parallelism (1000s of cores)
**Cons:** Limited support, complex memory model, overkill for most operations
**Decision:** Deferred to v4.0 if there's demand

### 2. SIMD in WASM
**Pros:** 2-4x speedup for vector operations
**Cons:** Limited browser/Node support, already using AssemblyScript optimizations
**Decision:** Consider for v3.1 as enhancement

### 3. Native Addons (N-API)
**Pros:** Direct access to optimized libraries (BLAS, LAPACK)
**Cons:** Platform-specific builds, deployment complexity
**Decision:** Rejected - WASM is more portable

### 4. Rust + WASM
**Pros:** Better performance than AssemblyScript
**Cons:** Steeper learning curve, larger builds
**Decision:** Consider for v4.0 rewrite

---

## Appendix B: Benchmark Methodology

### Test Environment
- **CPU:** AMD EPYC / Intel Xeon (multi-core)
- **RAM:** 16GB+
- **Node.js:** v18+ (worker_threads support)
- **OS:** Linux (for consistent performance)

### Test Data
```typescript
// Matrix sizes
const matrixSizes = [
  2, 5, 10, 20, 50, 100, 200, 500, 1000
];

// Array sizes
const arraySizes = [
  10, 100, 1000, 10000, 100000, 1000000
];

// Run each test 100 times, report median
function benchmark(operation, data, iterations = 100) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    operation(data);
    times.push(performance.now() - start);
  }
  return median(times);
}
```

### Metrics
- **Execution Time:** Median of 100 runs
- **Throughput:** Operations per second
- **Memory Usage:** Peak RSS during operation
- **Scalability:** Time vs. worker count
- **Overhead:** Small operation penalty

---

## Next Steps

1. **Review this plan** - Get feedback from stakeholders
2. **Create PoC** - Basic worker pool with one operation
3. **Benchmark PoC** - Validate performance assumptions
4. **Iterate** - Refine based on results
5. **Full implementation** - Follow roadmap

---

**Document Version:** 1.0
**Last Updated:** November 18, 2025
**Status:** DRAFT - Awaiting Review
