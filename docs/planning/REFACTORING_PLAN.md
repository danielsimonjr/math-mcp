# Math MCP Refactoring Plan - Context/Token Optimization & Code Quality

**Version:** 3.3.0 (Planned)
**Date:** November 26, 2025
**Goal:** Reduce context/token usage, eliminate redundancy, implement lazy loading, and improve maintainability

---

## Executive Summary

This document consolidates and extends the previous refactoring plans with a new focus on **context/token reduction** for AI-assisted development, while maintaining all existing functionality and performance.

### Primary Objectives

1. **Reduce Context/Token Usage** - Minimize code verbosity without sacrificing clarity
2. **Implement Lazy Loading** - Defer initialization of expensive resources
3. **Eliminate Redundancy** - Extract common patterns into reusable utilities
4. **Remove Dead Code** - Clean up deprecated functions and unused exports
5. **Optimize Documentation** - Streamlined JSDoc that reduces tokens while maintaining clarity

### Estimated Impact

| Metric | Current | Target | Reduction |
|--------|---------|--------|-----------|
| `wasm-wrapper.ts` | 1,097 lines | ~400 lines | 64% |
| `acceleration-router.ts` | 785 lines | ~350 lines | 55% |
| `tool-handlers.ts` | 995 lines | ~500 lines | 50% |
| Total Source LOC | ~5,500 lines | ~3,500 lines | 36% |

---

## Current State Analysis

### Files Requiring Refactoring (by Priority)

| File | Lines | Issue | Priority |
|------|-------|-------|----------|
| `wasm-wrapper.ts` | 1,097 | Highly repetitive operation patterns | 🔴 High |
| `acceleration-router.ts` | 785 | Duplicate routing logic + deprecated layer | 🔴 High |
| `tool-handlers.ts` | 995 | Repetitive handler patterns | 🟠 Medium |
| `validation.ts` | 583 | Verbose but modular | 🟢 Low |
| `workers/parallel-matrix.ts` | 416 | Could use generic patterns | 🟠 Medium |
| `workers/parallel-stats.ts` | 434 | Could use generic patterns | 🟠 Medium |

### Key Anti-Patterns Identified

1. **Repetitive WASM Operations** (wasm-wrapper.ts:622-1010)
   - 13 nearly identical functions following the same pattern
   - Each has ~35-40 lines of boilerplate

2. **Duplicate Routing Logic** (acceleration-router.ts:250-560)
   - 5 matrix operations with identical routing structure
   - Copy-paste pattern for GPU → Workers → WASM → mathjs fallback

3. **Deprecated Backward Compatibility Layer** (acceleration-router.ts:673-785)
   - ~112 lines of deprecated wrapper functions
   - Should be isolated or removed

4. **Verbose Error Handling** (tool-handlers.ts)
   - Same try/catch/perfTracker pattern repeated 7 times
   - Could be abstracted into a decorator pattern

5. **Redundant JSDoc Examples**
   - Many functions have verbose examples that add 10-20 lines each
   - Could use @see references for similar functions

---

## Sprint 1: WASM Wrapper Optimization (5-7 days)

### Goal
Reduce `wasm-wrapper.ts` from 1,097 to ~400 lines by extracting common patterns.

### Task 1.1: Create Generic Operation Executor
**File:** `src/wasm-executor.ts` (NEW)
**Lines Saved:** ~300 lines
**Priority:** 🔴 Critical

**Description:**
Create a generic executor that handles the common pattern across all WASM operations:
- Threshold checking
- Performance tracking
- Error handling with fallback
- Logging

**Implementation:**
```typescript
// src/wasm-executor.ts
interface WasmOperationConfig<TInput, TResult> {
  name: string;
  thresholdKey: keyof typeof THRESHOLDS;
  sizeGetter: (input: TInput) => number;
  wasmFn: (input: TInput) => TResult;
  mathjsFn: (input: TInput) => TResult;
  extraCheck?: (input: TInput) => boolean;
}

async function executeWasmOperation<TInput, TResult>(
  config: WasmOperationConfig<TInput, TResult>,
  input: TInput
): Promise<TResult> {
  const size = config.sizeGetter(input);
  const useWASM = shouldUseWASM(config.thresholdKey, size) &&
                  (!config.extraCheck || config.extraCheck(input));

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM && wasmModule) {
      logger.debug(`Using WASM for ${config.name}`, { size });
      const result = config.wasmFn(input);
      recordPerf('wasm', performance.now() - start);
      return result;
    }
  } catch (error) {
    logger.error(`WASM ${config.name} failed, falling back to mathjs`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.debug(`Using mathjs for ${config.name}`, { size });
  const result = config.mathjsFn(input);
  recordPerf('mathjs', performance.now() - start);
  return result;
}
```

**Verification:**
- [ ] All 13 WASM operations use the generic executor
- [ ] All existing unit tests pass
- [ ] Performance benchmarks show no regression

---

### Task 1.2: Consolidate Matrix Operations
**File:** `src/wasm-wrapper.ts` (REFACTOR)
**Lines Saved:** ~150 lines

**Description:**
Replace individual matrix functions with a registry pattern.

**Before (5 functions × 40 lines = 200 lines):**
```typescript
export async function matrixMultiply(a, b) { /* 40 lines */ }
export async function matrixTranspose(m) { /* 40 lines */ }
export async function matrixDeterminant(m) { /* 40 lines */ }
export async function matrixAdd(a, b) { /* 40 lines */ }
export async function matrixSubtract(a, b) { /* 40 lines */ }
```

**After (1 registry + thin wrappers = 50 lines):**
```typescript
const matrixOperations = {
  multiply: { thresholdKey: 'matrix_multiply', wasm: wasmMatrix.multiply, mathjs: math.multiply },
  determinant: { thresholdKey: 'matrix_det', wasm: wasmMatrix.det, mathjs: math.det },
  transpose: { thresholdKey: 'matrix_transpose', wasm: wasmMatrix.transpose, mathjs: math.transpose },
  add: { thresholdKey: 'matrix_transpose', wasm: wasmMatrix.add, mathjs: math.add },
  subtract: { thresholdKey: 'matrix_transpose', wasm: wasmMatrix.subtract, mathjs: math.subtract },
};

export const matrixMultiply = (a, b) => executeMatrixOp('multiply', a, b);
export const matrixDeterminant = (m) => executeMatrixOp('determinant', m);
// etc.
```

---

### Task 1.3: Consolidate Statistics Operations
**File:** `src/wasm-wrapper.ts` (REFACTOR)
**Lines Saved:** ~200 lines

**Description:**
Apply the same registry pattern to statistics operations (9 functions).

**Before:** 9 functions × 40 lines = 360 lines
**After:** 1 registry + thin wrappers = ~60 lines

---

### Task 1.4: Streamline JSDoc Comments
**Lines Saved:** ~100 lines

**Description:**
Replace verbose per-function JSDoc with:
1. Single comprehensive module-level documentation
2. Concise inline comments for each function
3. Use `@see` references for similar functions

**Before:**
```typescript
/**
 * Calculates the mean (average) of an array with automatic WASM/mathjs routing.
 *
 * **Routing logic:**
 * - If WASM is initialized AND array length >= 100: use WASM
 * - Otherwise: use mathjs
 * - If WASM fails: fall back to mathjs
 *
 * @param {number[]} data - Array of numbers
 * @returns {Promise<number>} The mean value
 *
 * @example
 * ```typescript
 * const result = await statsMean([1,2,3,4,5]);
 * // Returns: 3
 * ```
 */
```

**After:**
```typescript
/** Calculates mean with auto WASM/mathjs routing. @see statsMedian for similar usage. */
```

---

### Task 1.5: Remove Unused Code
**Lines Saved:** ~50 lines

- Remove `_projectRoot` unused variable (line 272)
- Remove duplicate type definitions
- Clean up commented-out code

---

## Sprint 2: Acceleration Router Optimization (5-7 days)

### Goal
Reduce `acceleration-router.ts` from 785 to ~350 lines.

### Task 2.1: Extract Generic Routing Logic
**File:** `src/routing-utils.ts` (NEW)
**Lines Saved:** ~200 lines

**Description:**
Create a generic tier-based routing function that handles the GPU → Workers → WASM → mathjs fallback chain.

**Implementation:**
```typescript
// src/routing-utils.ts
interface TierConfig<TInput, TResult> {
  operation: string;
  input: TInput;
  tiers: Array<{
    tier: AccelerationTier;
    shouldUse: () => boolean;
    execute: () => Promise<TResult>;
  }>;
  fallback: () => TResult;
}

async function routeWithFallback<TInput, TResult>(
  config: TierConfig<TInput, TResult>,
  stats: RoutingStats
): Promise<{ result: TResult; tier: AccelerationTier }> {
  for (const { tier, shouldUse, execute } of config.tiers) {
    if (shouldUse()) {
      try {
        logger.debug(`Routing ${config.operation} to ${tier}`);
        const result = await execute();
        stats[`${tier}Usage`]++;
        return { result, tier };
      } catch (error) {
        logDegradation(config.operation, tier, /* next tier */, error);
      }
    }
  }

  const result = config.fallback();
  stats.mathjsUsage++;
  return { result, tier: AccelerationTier.MATHJS };
}
```

---

### Task 2.2: Isolate Deprecated Backward Compatibility Layer
**File:** `src/acceleration-router-compat.ts` (NEW)
**Lines Saved:** ~100 lines (from main file)

**Description:**
Move the deprecated functions (lines 673-785) to a separate compatibility module that can be optionally imported.

**Impact:**
- Main router file becomes cleaner
- Deprecated code is clearly isolated
- Can be removed entirely in next major version

---

### Task 2.3: Use Operation Registry Pattern
**Lines Saved:** ~80 lines

**Description:**
Instead of separate methods for each matrix operation, use a registry:

```typescript
private readonly matrixOps = {
  multiply: { parallel: parallelMatrixMultiply, wasm: wasmMatrixMultiply },
  transpose: { parallel: parallelMatrixTranspose, wasm: wasmMatrixTranspose },
  add: { parallel: parallelMatrixAdd, wasm: wasmMatrixAdd },
  subtract: { parallel: parallelMatrixSubtract, wasm: wasmMatrixSubtract },
};

async matrixOperation(op: keyof typeof this.matrixOps, ...args) {
  return this.routeMatrix(op, ...args);
}
```

---

### Task 2.4: Simplify Stats Operations
**Lines Saved:** ~50 lines

**Description:**
The simple stats operations (lines 564-636) are just pass-through wrappers. Convert to:

```typescript
// Direct re-exports for simple WASM-only operations
export const matrixDeterminant = wasmMatrixDeterminant;
export const statsMedian = wasmStatsMedian;
export const statsStd = wasmStatsStd;
// etc.
```

---

## Sprint 3: Tool Handlers Optimization (4-5 days)

### Goal
Reduce `tool-handlers.ts` from 995 to ~500 lines.

### Task 3.1: Create Handler Factory Pattern
**File:** `src/handler-factory.ts` (NEW)
**Lines Saved:** ~200 lines

**Description:**
Extract the common handler pattern (validation → operation → performance tracking → response formatting) into a factory.

**Implementation:**
```typescript
interface HandlerConfig<TArgs, TResult> {
  name: string;
  validate: (args: TArgs) => TArgs;
  execute: (args: TArgs, accelerator?: AccelerationWrapper) => Promise<TResult>;
  formatResult: (result: TResult) => string;
}

function createHandler<TArgs, TResult>(
  config: HandlerConfig<TArgs, TResult>
): (args: TArgs, accelerator?: AccelerationWrapper) => Promise<ToolResponse> {
  return async (args, accelerator) => {
    const startTime = performance.now();
    try {
      const validated = config.validate(args);
      const result = await config.execute(validated, accelerator);
      perfTracker.recordOperation(config.name, performance.now() - startTime);
      return {
        content: [{ type: 'text', text: JSON.stringify({ result: config.formatResult(result) }, null, 2) }],
        isError: false,
      };
    } catch (error) {
      perfTracker.recordOperation(`${config.name}_error`, performance.now() - startTime);
      logger.error(`${config.name} failed`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
}
```

---

### Task 3.2: Consolidate Switch Statements
**Lines Saved:** ~150 lines

**Description:**
Replace verbose switch statements in `handleMatrixOperations` and `handleStatistics` with operation maps.

**Before (handleMatrixOperations):**
```typescript
switch (validOperation) {
  case 'multiply': {
    /* 15 lines */
  }
  case 'inverse': {
    /* 10 lines */
  }
  // ... 5 more cases
}
```

**After:**
```typescript
const matrixOps = {
  multiply: async (a, b, accel) => accel?.matrixMultiply(a, b) ?? math.multiply(a, b),
  inverse: async (a) => math.inv(a),
  determinant: async (a, _, accel) => accel?.matrixDeterminant(a) ?? math.det(a),
  // etc.
};
return matrixOps[validOperation](matrixA, matrixB, accelerationWrapper);
```

---

### Task 3.3: Extract safeEvaluate to Separate Module
**File:** `src/safe-eval.ts` (NEW)
**Lines Saved:** ~80 lines (improves separation of concerns)

**Description:**
Move the AST validation logic (lines 95-188) to a dedicated security module.

---

## Sprint 4: Lazy Loading Implementation (3-4 days)

### Goal
Implement lazy initialization for expensive resources.

### Task 4.1: Lazy WASM Module Loading
**Priority:** 🔴 High

**Current Behavior:**
```typescript
// Module-level initialization (blocks import)
initWASM().catch((err) => { ... });
```

**New Behavior:**
```typescript
let wasmPromise: Promise<void> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;
  if (!wasmPromise) {
    wasmPromise = initWASM();
  }
  await wasmPromise;
}

// Called on first operation, not on import
export async function statsMean(data: number[]): Promise<number> {
  await ensureWasmInitialized();
  // ... rest of implementation
}
```

**Benefits:**
- Faster initial load time
- Reduced memory usage when WASM not needed
- Better for serverless environments

---

### Task 4.2: Lazy Worker Pool Initialization
**Priority:** 🟠 Medium

**Current Behavior:**
Worker pool initializes during router construction or first use.

**Improvement:**
Defer worker pool creation until first parallel operation is needed.

```typescript
private workerPoolPromise: Promise<WorkerPool | null> | null = null;

private async getWorkerPoolLazy(): Promise<WorkerPool | null> {
  if (this.workerPool) return this.workerPool;
  if (!this.workerPoolPromise) {
    this.workerPoolPromise = this.createWorkerPool();
  }
  return this.workerPoolPromise;
}
```

---

### Task 4.3: Dynamic Import for GPU Module
**Priority:** 🟢 Low

**Description:**
Use dynamic import for WebGPU wrapper since it's rarely used:

```typescript
private async getGpuModule() {
  if (!this.gpuModule) {
    this.gpuModule = await import('./gpu/webgpu-wrapper.js');
  }
  return this.gpuModule;
}
```

---

## Sprint 5: Documentation Optimization (2-3 days)

### Goal
Reduce documentation verbosity while maintaining clarity.

### Task 5.1: Create Module-Level Documentation
**Description:**
Replace per-function documentation with comprehensive module headers.

**Benefits:**
- Reduces total lines by ~200-300
- Single source of truth for module behavior
- Easier to maintain

---

### Task 5.2: Standardize @see References
**Description:**
For similar functions, use cross-references instead of duplicating documentation.

---

### Task 5.3: Extract Examples to Separate Doc Files
**Description:**
Move verbose code examples from JSDoc to `docs/examples/` directory.

---

## Sprint 6: Dead Code Removal (1-2 days)

### Task 6.1: Audit Unused Exports
**Tool:** `ts-prune` or manual analysis

**Candidates:**
- `WasmWrapper` type alias (deprecated)
- Old routing functions in backward compatibility layer
- Unused utility functions

---

### Task 6.2: Remove Deprecated Functions
**Description:**
After confirming no external usage, remove:
- `routedMatrixMultiply` (use `AccelerationRouter.matrixMultiply`)
- `routedStatsMean` (use `AccelerationRouter.statsMean`)
- Other deprecated wrappers

---

### Task 6.3: Clean Up Test Files
**Description:**
Large test files can also be optimized:
- Extract common test fixtures
- Use test factories
- Remove duplicate assertions

---

## Sprint 7: Worker Infrastructure Optimization (3-4 days)

### Task 7.1: Consolidate Parallel Matrix/Stats
**Lines Saved:** ~200 lines

**Description:**
Create a generic parallel execution framework:

```typescript
// src/workers/parallel-executor.ts
interface ParallelConfig<TInput, TResult> {
  operation: string;
  chunk: (input: TInput, numWorkers: number) => TInput[];
  execute: (chunk: TInput) => Promise<TResult>;
  merge: (results: TResult[]) => TResult;
}
```

---

### Task 7.2: Simplify Worker Types
**File:** `src/workers/worker-types.ts`

**Description:**
Reduce type definitions by using more generics.

---

## Implementation Roadmap

### Phase 1: Core Optimization (Sprints 1-2)
- WASM wrapper optimization
- Acceleration router optimization
- **Target:** 50% reduction in these files

### Phase 2: Handler & Lazy Loading (Sprints 3-4)
- Tool handlers optimization
- Lazy loading implementation
- **Target:** 40% reduction in handlers

### Phase 3: Polish & Cleanup (Sprints 5-7)
- Documentation optimization
- Dead code removal
- Worker infrastructure optimization
- **Target:** Final 10% cleanup

---

## Verification Checklist

### Before Each Sprint
- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] Benchmark baseline recorded

### After Each Sprint
- [ ] All tests still pass
- [ ] Performance benchmarks show no regression (±5%)
- [ ] Lines of code reduced as expected
- [ ] Code review completed

### Final Verification
- [ ] Full test suite passes (integration, unit, security)
- [ ] Production deployment tested
- [ ] Documentation updated
- [ ] CHANGELOG updated

---

## Risk Assessment

### High Risk
| Risk | Mitigation |
|------|------------|
| Breaking existing API | All changes are internal; public API unchanged |
| Performance regression | Benchmark before/after each change |
| WASM loading issues | Maintain fallback to mathjs |

### Medium Risk
| Risk | Mitigation |
|------|------------|
| Lazy loading race conditions | Use promise-based initialization |
| Test coverage gaps | Ensure 100% test coverage for refactored code |

### Low Risk
| Risk | Mitigation |
|------|------------|
| Documentation gaps | Review docs after each sprint |

---

## Success Metrics

### Quantitative
- [ ] 36%+ reduction in total source lines
- [ ] No performance regression (< 5% variance)
- [ ] 100% test pass rate maintained
- [ ] Zero new TypeScript errors

### Qualitative
- [ ] Improved code readability
- [ ] Easier to navigate codebase
- [ ] Reduced cognitive load for AI assistants
- [ ] Faster context loading for Claude Code

---

## Previous Plan Integration

This plan supersedes and incorporates relevant items from:
- `REFACTORING_PLAN.md` (November 18, 2025) - WebWorkers & WASM focus
- `SPRINT_9_PLAN.md` - Advanced features
- `CODE_QUALITY_IMPROVEMENTS.md` - v2.1.0 improvements

### Retained from Previous Plans
- ✅ WebWorker architecture (already implemented)
- ✅ Backpressure implementation (already implemented)
- ✅ Security testing suite (already implemented)
- ✅ Telemetry & observability (already implemented)
- 🔄 Additional WASM implementations (deferred to future)
- 🔄 SIMD optimizations (deferred to future)

---

## Appendix A: File Size Targets

| File | Current | Target | Method |
|------|---------|--------|--------|
| `wasm-wrapper.ts` | 1,097 | 400 | Generic executor pattern |
| `acceleration-router.ts` | 785 | 350 | Generic routing + compat isolation |
| `tool-handlers.ts` | 995 | 500 | Handler factory pattern |
| `validation.ts` | 583 | 450 | Minimal changes |
| `parallel-matrix.ts` | 416 | 250 | Generic parallel executor |
| `parallel-stats.ts` | 434 | 250 | Generic parallel executor |

---

## Appendix B: Quick Wins (Can Be Done Immediately)

1. **Remove `index.ts.bak`** - 11KB backup file in src/
2. **Remove unused imports** - Various files
3. **Consolidate type re-exports** - Reduce redundancy
4. **Simplify error messages** - Some are overly verbose

---

**Document Version:** 2.0
**Last Updated:** November 26, 2025
**Status:** READY FOR IMPLEMENTATION
