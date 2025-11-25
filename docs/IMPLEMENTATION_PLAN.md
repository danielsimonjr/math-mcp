# Math-MCP WASM Acceleration - Implementation Plan

> **Note on Strategic Pivot**: The original implementation plan (October 26, 2025) proposed a fork-based approach where we would clone mathjs to `dev/mathjs-wasm/` and modify its internals. After further analysis, we pivoted to a **wrapper pattern** approach that proved to be simpler, more maintainable, and faster to implement. This document describes the wrapper pattern strategy that was actually executed.

## Overview

This document describes the **wrapper pattern** implementation strategy for adding WebAssembly acceleration to the math-mcp server. This approach provides a clean separation between the MCP server, WASM acceleration modules, and the mathjs library.

**Strategy**: Wrapper Pattern with Threshold-Based Routing
**Language**: AssemblyScript
**Target**: Performance-critical numerical operations
**Status**: ✅ Production Ready (v2.0.0-wasm)

## Strategic Decision: Wrapper vs Fork

### Original Approach (Not Executed)

The initial plan proposed forking mathjs and replacing internal functions:

```
Proposed:
- Clone mathjs to dev/mathjs-wasm/
- Modify internal mathjs functions to call WASM
- Maintain as a separate fork
- Replace npm mathjs with local fork
```

### Chosen Approach: Wrapper Pattern

Instead, we implemented a wrapper layer that sits between the MCP server and both WASM/mathjs:

```
Architecture:
MCP Server → WASM Wrapper → [WASM Modules | mathjs]
                    ↓
            Threshold-Based Routing
```

### Rationale for Wrapper Pattern

**Maintenance**:
- ❌ Fork: Must track upstream mathjs changes
- ✅ Wrapper: mathjs stays in node_modules, easy updates

**Complexity**:
- ❌ Fork: Deep integration with mathjs internals
- ✅ Wrapper: Clean separation, simple interface

**Risk**:
- ❌ Fork: Can break symbolic math capabilities
- ✅ Wrapper: mathjs functionality untouched

**Testing**:
- ❌ Fork: Must validate all mathjs internals
- ✅ Wrapper: Test only wrapper logic and WASM modules

**Flexibility**:
- ❌ Fork: Committed to mathjs structure
- ✅ Wrapper: Can optimize independently

**Development Speed**:
- ❌ Fork: Weeks to understand mathjs internals
- ✅ Wrapper: Can start implementing immediately

## Implementation Strategy

### 1. Identify Performance-Critical Operations

**Criteria for WASM acceleration**:
- High computational cost (O(n²) or O(n³))
- Operates on numerical data only
- Pure functions (no symbolic manipulation)
- Measurable performance bottleneck

**Operations Selected**:

**Matrix Operations** (High Priority):
- `multiply()` - O(n³) complexity
- `determinant()` - O(n³) with LU decomposition
- `transpose()` - O(n²) memory operations
- `add()` / `subtract()` - O(n²) operations

**Statistical Operations** (Medium Priority):
- `mean()` - O(n) with large n
- `median()` - O(n log n) sorting
- `std()` / `variance()` - O(n) with multiple passes
- `min()` / `max()` - O(n) linear scan

**NOT Accelerated** (Symbolic):
- Expression parsing
- Algebraic simplification
- Symbolic derivatives
- Equation solving
- Unit conversion

### 2. Threshold-Based Routing Strategy

**Core Principle**: Use WASM only when performance gain exceeds overhead

**Overhead Sources**:
- JS → WASM boundary crossing
- Memory allocation/copying
- Type conversion
- WASM module call overhead

**Threshold Determination**:

```typescript
// Benchmark-driven thresholds
const THRESHOLDS = {
  matrix_multiply: 10,    // 10×10: WASM overhead breaks even
  matrix_det: 5,          // 5×5: LU decomposition benefits
  matrix_transpose: 20,   // 20×20: Memory operations benefit
  statistics: 100,        // 100 elements: Linear ops benefit
  median: 50,             // 50 elements: Sorting benefits
};
```

**Decision Logic**:
1. Measure input size
2. Compare against threshold
3. Route to WASM if size ≥ threshold
4. Route to mathjs if size < threshold
5. On error, fallback to mathjs

### 3. WASM Implementation Strategy

**Language Choice: AssemblyScript**

**Why AssemblyScript**:
- TypeScript-compatible syntax (team familiarity)
- Direct compilation to WASM
- Predictable performance characteristics
- Good tooling and documentation
- Faster development than Rust/C++

**Trade-offs**:
- Performance: 80-90% of Rust/C++ (acceptable)
- Ecosystem: Smaller than Rust (acceptable)
- Memory: Manual management required (acceptable)
- Benefit: 3-5x faster development time

**WASM Module Design**:

```
wasm/
├── assembly/          # AssemblyScript source
│   ├── matrix.ts      # Matrix operations
│   └── statistics.ts  # Statistical operations
├── bindings/          # JavaScript bindings
│   ├── matrix.cjs     # CommonJS wrapper
│   └── statistics.cjs # CommonJS wrapper
└── build/             # Compiled WASM
    ├── release.wasm   # Production (optimized)
    └── debug.wasm     # Development (symbols)
```

**Module Principles**:
- **Stateless**: No global state in WASM
- **Type-safe**: Strict typing at boundaries
- **Memory-safe**: Proper allocation/deallocation
- **Error-handling**: Validate inputs, return errors
- **Optimized**: Use `-O3` for production builds

### 4. Wrapper Layer Design

**Location**: `src/wasm-wrapper.ts`

**Responsibilities**:
1. **Routing**: Decide WASM vs mathjs based on thresholds
2. **Fallback**: Catch WASM errors, use mathjs
3. **Type Conversion**: JS ↔ WASM data marshalling
4. **Performance Tracking**: Monitor WASM usage and timing
5. **API Compatibility**: Maintain mathjs-compatible interface

**Interface Design**:

```typescript
// Wrapper functions mirror mathjs API
export function matrixOperations(
  operation: string,
  matrix_a: number[][],
  matrix_b?: number[][]
): number[][] | number;

export function statistics(
  operation: string,
  data: number[]
): number;

// Symbolic operations pass through to mathjs
export function evaluate(expression: string, scope?: object): any;
export function simplify(expression: string): any;
export function derivative(expression: string, variable: string): any;
```

**Error Handling Strategy**:

```typescript
try {
  if (shouldUseWasm(input)) {
    return wasmFunction(input);
  }
} catch (error) {
  // Automatic fallback
  logFallback(operation, error);
}
// Always return mathjs result
return mathjsFunction(input);
```

### 5. Dual Server Strategy

**Two Entry Points**:

**`src/index.ts`** - Original mathjs-only server:
- No WASM dependencies
- Pure mathjs implementation
- Serves as fallback and reference
- Useful for debugging and comparison

**`src/index-wasm.ts`** - WASM-accelerated server:
- Imports from wasm-wrapper
- Production entry point
- Uses WASM when beneficial
- Falls back to mathjs automatically

**Build Output**:
```
dist/
├── index.js         # Mathjs-only (fallback)
├── index-wasm.js    # WASM-accelerated (production)
└── wasm-wrapper.js  # Wrapper layer
```

**Package.json Configuration**:
```json
{
  "name": "math-mcp",
  "main": "dist/index-wasm.js",
  "bin": {
    "math-mcp": "dist/index-wasm.js"
  }
}
```

### 6. Build Pipeline Strategy

**TypeScript Build**:
```bash
tsc --project tsconfig.json
# Compiles src/*.ts → dist/*.js
```

**WASM Build**:
```bash
cd wasm
npx gulp
# Compiles assembly/*.ts → build/*.wasm
# Generates bindings/*.cjs
```

**Build Optimization**:
- **Development**: Debug WASM with source maps
- **Production**: Optimized WASM (`-O3`, shrink level 2)
- **Continuous**: Watch mode for development

### 7. Testing Strategy

**Three-Tier Testing**:

**Tier 1: Unit Tests** (WASM modules)
- Test individual WASM functions
- Validate edge cases
- Check error handling

**Tier 2: Differential Tests**
- Compare WASM vs mathjs results
- Floating-point tolerance testing
- Random input generation
- Ensure mathematical correctness

**Tier 3: Integration Tests**
- End-to-end MCP server testing
- Threshold routing validation
- Performance monitoring
- Fallback mechanism testing

**Acceptance Criteria**:
- All tests pass (100%)
- WASM results match mathjs (within tolerance)
- Performance targets met
- No regressions

## Implementation Phases

### Phase 1: Infrastructure Setup

**Objective**: Establish WASM build pipeline

**Tasks**:
- Install AssemblyScript toolchain
- Create wasm/ directory structure
- Configure asconfig.json
- Set up Gulp build automation
- Create initial WASM module
- Verify compilation and loading

**Deliverables**:
- Working WASM build pipeline
- Node.js can load WASM modules
- Build scripts in package.json

### Phase 2: Core WASM Modules

**Objective**: Implement performance-critical operations

**Matrix Module** (`wasm/assembly/matrix.ts`):
- Matrix multiplication (cache-friendly)
- Determinant (LU decomposition)
- Transpose (memory-efficient)
- Add/subtract operations

**Statistics Module** (`wasm/assembly/statistics.ts`):
- Mean (single pass)
- Median (quickselect algorithm)
- Standard deviation (Welford's algorithm)
- Variance (derived from std)
- Min/max (SIMD-friendly linear scan)

**Deliverables**:
- Compiled WASM modules
- JavaScript bindings (CommonJS)
- Unit tests for each function

### Phase 3: Wrapper Layer

**Objective**: Create intelligent routing layer

**Tasks**:
- Implement threshold-based routing
- Add automatic fallback logic
- Create type conversion utilities
- Add performance monitoring
- Maintain mathjs API compatibility

**Deliverables**:
- `src/wasm-wrapper.ts` complete
- All wrapper functions tested
- Performance tracking working

### Phase 4: MCP Server Integration

**Objective**: Create WASM-accelerated server

**Tasks**:
- Create `src/index-wasm.ts`
- Update tool handlers to use wrapper
- Preserve `src/index.ts` as fallback
- Update package.json entry points
- Configure build scripts

**Deliverables**:
- Dual servers (mathjs-only + WASM)
- Both servers tested and working
- Production entry point set to WASM version

### Phase 5: Testing & Validation

**Objective**: Comprehensive test coverage

**Tasks**:
- Write integration tests (11 tests minimum)
- Create differential test suite
- Build performance benchmarks
- Validate threshold settings
- Test fallback mechanisms

**Deliverables**:
- All tests passing
- Performance benchmarks documented
- WASM usage rate measured

### Phase 6: Documentation & Deployment

**Objective**: Production-ready deployment

**Tasks**:
- Document build process (BUILD_GUIDE.md)
- Document testing (TEST_GUIDE.md)
- Document deployment (DEPLOYMENT_PLAN.md)
- Update product spec (PRODUCT_SPECIFICATION.md)
- Configure for Claude Desktop/CLI

**Deliverables**:
- Complete documentation
- Deployed to Claude Desktop
- Deployed to Claude CLI
- Production ready

## Performance Strategy

### Optimization Techniques

**Algorithm Selection**:
- LU decomposition for determinants (vs cofactor expansion)
- Quickselect for median (vs full sort)
- Welford's algorithm for variance (single pass)
- Cache-friendly matrix traversal

**Memory Management**:
- Minimize allocations in hot paths
- Reuse buffers where possible
- Efficient JS ↔ WASM data transfer
- Proper deallocation to avoid leaks

**WASM Compilation**:
```json
{
  "optimizeLevel": 3,
  "shrinkLevel": 2,
  "converge": true,
  "noAssert": true
}
```

**Threshold Tuning**:
- Benchmark WASM vs mathjs at various sizes
- Find crossover point (overhead = benefit)
- Set threshold slightly above crossover
- Document rationale for each threshold

### Performance Targets

**Matrix Operations**:
- 10×10 multiply: 5-7x speedup
- 20×20 multiply: 7-10x speedup
- 50×50 determinant: 10-15x speedup

**Statistics**:
- 100 element mean: 5-10x speedup
- 1000 element median: 15-25x speedup
- 10000 element std: 15-20x speedup

**Overall**:
- Average speedup: 10-15x
- Peak speedup: 30-50x
- WASM usage rate: 60-80%

## Risk Mitigation

### Risk: WASM Initialization Failure

**Mitigation**:
- Automatic fallback to mathjs
- No user-facing errors
- Log failure for debugging
- Server continues operating

**Implementation**:
```typescript
let wasmInitialized = false;
try {
  await initWasm();
  wasmInitialized = true;
} catch (error) {
  console.error('[WASM] Init failed, using mathjs');
}
```

### Risk: Incorrect Results

**Mitigation**:
- Differential testing (WASM vs mathjs)
- 1000+ random test cases
- Floating-point tolerance validation
- Edge case coverage

**Acceptance**: 100% differential tests must pass

### Risk: Performance Regression

**Mitigation**:
- Benchmark before/after
- Threshold-based routing avoids overhead
- Small inputs use mathjs (fast path)
- Large inputs use WASM (accelerated)

**Acceptance**: No operation slower than mathjs

### Risk: Maintenance Burden

**Mitigation**:
- Wrapper pattern (no fork)
- mathjs stays in node_modules
- WASM modules independent
- Clear separation of concerns

**Benefit**: Easy to update mathjs version

## Technical Specifications

### WASM Module Interface

**Matrix Multiply**:
```typescript
// AssemblyScript signature
export function multiply(
  a: Float64Array,
  rows_a: i32,
  cols_a: i32,
  b: Float64Array,
  rows_b: i32,
  cols_b: i32
): Float64Array;

// JavaScript binding
function matrixMultiply(
  a: number[][],
  b: number[][]
): number[][];
```

**Statistics Mean**:
```typescript
// AssemblyScript signature
export function mean(
  data: Float64Array,
  length: i32
): f64;

// JavaScript binding
function mean(data: number[]): number;
```

### Data Transfer Protocol

**JS → WASM**:
1. Flatten 2D arrays to 1D Float64Array
2. Pass dimensions separately
3. Transfer to WASM heap
4. Call WASM function

**WASM → JS**:
1. WASM returns flat Float64Array
2. Reshape to 2D array if needed
3. Convert to JavaScript number[][]
4. Free WASM memory

### Error Handling Protocol

**WASM Errors**:
- Invalid dimensions → Return error code
- Singular matrix → Return NaN
- Memory allocation failure → Return null
- All errors trigger fallback to mathjs

**Wrapper Errors**:
- Catch all WASM exceptions
- Log error for debugging
- Invoke mathjs fallback
- Return mathjs result

## Configuration

### AssemblyScript Configuration

**File**: `wasm/asconfig.json`

```json
{
  "extends": "assemblyscript/std/assembly.json",
  "targets": {
    "release": {
      "outFile": "build/release.wasm",
      "optimizeLevel": 3,
      "shrinkLevel": 2,
      "noAssert": true
    },
    "debug": {
      "outFile": "build/debug.wasm",
      "debug": true,
      "sourceMap": true
    }
  }
}
```

### TypeScript Configuration

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

### Package Scripts

**File**: `package.json`

```json
{
  "scripts": {
    "build": "tsc",
    "build:wasm": "cd wasm && npx gulp",
    "build:all": "npm run build && npm run build:wasm",
    "start": "node dist/index-wasm.js",
    "test": "node test/integration-test.js"
  }
}
```

## Success Criteria

### Functional Requirements
- ✅ All 7 MCP tools working
- ✅ WASM acceleration for matrix/stats
- ✅ Automatic fallback to mathjs
- ✅ API compatibility maintained

### Performance Requirements
- ✅ Matrix ops: 5-10x speedup (achieved 7-17x)
- ✅ Statistics: 10-20x speedup (achieved 15-42x)
- ✅ WASM usage rate: >60% (achieved 70%)
- ✅ No performance regressions

### Quality Requirements
- ✅ All tests passing (100%) - 11/11 integration tests
- ✅ Differential tests validated
- ✅ No memory leaks
- ✅ Error handling complete

### Documentation Requirements
- ✅ Build guide complete (BUILD_GUIDE.md)
- ✅ Test guide complete (TEST_GUIDE.md)
- ✅ Deployment guide complete (DEPLOYMENT_PLAN.md)
- ✅ API documentation complete (PRODUCT_SPECIFICATION.md)

## Conclusion

The wrapper pattern implementation strategy provides a clean, maintainable approach to WASM acceleration that:

- Avoids the complexity of forking mathjs
- Enables intelligent routing based on input size
- Provides automatic fallback for reliability
- Maintains full API compatibility
- Achieves significant performance improvements (14.30x average, 42x peak)
- Simplifies testing and validation

This strategy prioritizes **pragmatism over purity**, choosing an architecture that delivers performance gains while minimizing risk, complexity, and maintenance burden.

**Implementation Status**: ✅ Complete (v2.0.0-wasm)
**Deployment Status**: ✅ Production Ready
**Platform Support**: Claude Desktop ✅ | Claude CLI ✅

---

# Post-v3.1.0 Code Review - Remaining Tasks

**Review Date**: 2025-11-24
**Current Version**: v3.1.0
**Completed Items**: 11 critical/high priority issues (Rate limiting, WASM integrity, Expression sandboxing, Input sanitization, Expression caching, Logging streams, Mode consistency, JSON parsing protection, Build verification, ESLint strictness)

This section documents the remaining recommendations from the comprehensive code review, organized by complexity and priority for implementation in sprints.

## Task Organization

Tasks are organized into 4 complexity tiers:
- 🟢 **Simple**: Hours to complete, minimal refactoring
- 🟡 **Medium**: Days to complete, moderate refactoring
- 🟠 **Complex**: Weeks to complete, significant changes
- 🔴 **Major**: Months to complete, substantial work

**Total Remaining Work**: ~5-8 months for complete implementation
**Implementation Strategy**: Short sprints of 10 items each

---

## 🟢 TIER 1: Simple Tasks (12-16 hours total)

### Sprint 1A: Quick Wins (7 items)

#### Task 1: Make Timeouts Configurable (Issue #21)
**Priority**: Low
**Complexity**: 🟢 Simple
**Estimated Time**: 1-2 hours
**File**: `src/utils.ts`, `src/workers/worker-pool.ts`

**Current State**:
```typescript
// Hardcoded timeouts
export const DEFAULT_OPERATION_TIMEOUT = 30000;
workerIdleTimeout: 60000,
taskTimeout: 30000,
```

**Required Changes**:
1. Add environment variables:
   - `DEFAULT_OPERATION_TIMEOUT`
   - `WORKER_IDLE_TIMEOUT` (already exists)
   - `TASK_TIMEOUT` (already exists)
2. Update `src/utils.ts` to read from env
3. Document in README.md Configuration section

**Acceptance Criteria**:
- All timeouts configurable via environment variables
- Defaults remain the same
- Documentation updated

---

#### Task 2: Extract Matrix Size Checking Helper (Issue #23)
**Priority**: Low
**Complexity**: 🟢 Simple
**Estimated Time**: 1 hour
**File**: `src/wasm-wrapper.ts`

**Current State**:
```typescript
// Repeated 8+ times
const size = getMatrixSize(matrix);
const useWASM = wasmInitialized && size >= THRESHOLDS.matrix_det;
```

**Required Changes**:
1. Create helper function:
```typescript
function shouldUseWASM(
  operation: string,
  size: number
): boolean {
  if (!wasmInitialized) return false;
  const threshold = THRESHOLDS[operation];
  return size >= threshold;
}
```
2. Replace all repeated patterns
3. Add JSDoc documentation

**Acceptance Criteria**:
- Helper function implemented
- All occurrences replaced (8+ locations)
- Tests still pass
- Code more maintainable

---

#### Task 3: Standardize Naming Conventions (Issue #24)
**Priority**: Low
**Complexity**: 🟢 Simple
**Estimated Time**: 2-3 hours
**Files**: Multiple

**Current State**:
- Mix of `matrix_operations`, `matrixMultiply`, `math-worker.js`
- Inconsistent underscore/camelCase/kebab-case

**Required Changes**:
1. Choose convention (recommend: camelCase for code, kebab-case for files)
2. Update all function/variable names consistently
3. Update exports and imports
4. Update tests

**Convention Decision**:
- **Functions/Variables**: camelCase (`matrixMultiply`, `matrixA`, `matrixB`)
- **Files**: kebab-case (`math-worker.js`)
- **Tool Names**: snake_case (MCP convention - `matrix_operations`)

**Acceptance Criteria**:
- Consistent naming throughout codebase
- All tests pass
- No breaking changes to MCP tool API

---

#### Task 4: Add Missing JSDoc (~20%) (Issue #25)
**Priority**: Low
**Complexity**: 🟢 Simple
**Estimated Time**: 3-4 hours
**Files**: `src/acceleration-router.ts`, others

**Current State**:
```typescript
// Missing JSDoc
async function getWorkerPool(): Promise<WorkerPool | null>
export function getRoutingStats()
```

**Required Changes**:
1. Identify all functions missing JSDoc
2. Add comprehensive JSDoc to each:
   - Description
   - @param for each parameter
   - @returns for return value
   - @throws for exceptions
   - @example where helpful
3. Run ESLint to verify

**Target Functions** (partial list):
- `getWorkerPool()` - acceleration-router.ts:111
- `getRoutingStats()` - acceleration-router.ts:428
- ~15-20 more functions

**Acceptance Criteria**:
- All public functions have JSDoc
- ESLint JSDoc rules pass
- Documentation is accurate and helpful

---

#### Task 5: Update JSDoc Coverage Claim (Issue #37)
**Priority**: Low
**Complexity**: 🟢 Simple
**Estimated Time**: 1 hour
**File**: `README.md`

**Current State**:
```markdown
- **100% JSDoc Coverage:** All public APIs documented
```

**Required Changes**:
1. Either:
   - Option A: Complete JSDoc for all functions (see Task 4)
   - Option B: Update claim to be accurate
2. If Option B:
   ```markdown
   - **Comprehensive JSDoc:** All public APIs and most internal functions documented
   ```

**Acceptance Criteria**:
- Claim matches reality
- No misleading documentation

---

#### Task 6: Improve Installation Instructions (Issue #38)
**Priority**: Low
**Complexity**: 🟢 Simple
**Estimated Time**: 2 hours
**File**: `README.md`

**Current State**:
- Node.js 18+ requirement not prominent
- Missing platform-specific notes
- No verification steps

**Required Changes**:
1. Add prominent requirements section:
```markdown
## Requirements

- **Node.js**: ≥18.0.0 (required for worker_threads)
- **npm**: ≥8.0.0
- **Platform**: Windows, macOS, or Linux
```

2. Add platform-specific WASM build notes:
```markdown
### Platform-Specific Notes

**Linux/macOS**:
```bash
cd wasm && npm install && npx gulp && cd ..
```

**Windows**:
```powershell
cd wasm; npm install; npx gulp; cd ..
```
```

3. Add verification section:
```markdown
### Verify Installation

```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Run tests to verify everything works
npm test  # Should show 11/11 tests passing
```
```

**Acceptance Criteria**:
- Requirements clearly stated upfront
- Platform-specific instructions included
- Verification steps documented
- New users can successfully install

---

#### Task 7: Add Error Response Consistency (Issue #20)
**Priority**: Low-Medium
**Complexity**: 🟢 Simple
**Estimated Time**: 4-6 hours
**Files**: `src/tool-handlers.ts`, `src/index-wasm.ts`

**Current State**:
```typescript
// Error responses
return {
  content: [{ type: 'text', text: JSON.stringify({ error, errorType }) }],
  isError: true  // Sometimes set, sometimes not
};

// Success responses
return {
  content: [{ type: 'text', text: result }]
  // isError missing
};
```

**Required Changes**:
1. Add `isError: false` to all success responses
2. Ensure `isError: true` on all error responses
3. Update type definitions:
```typescript
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}
```
4. Update all tool handlers consistently

**Locations to Update**:
- `handleEvaluate()` - ~2 return statements
- `handleSimplify()` - ~2 return statements
- `handleDerivative()` - ~2 return statements
- `handleSolve()` - ~2 return statements
- `handleMatrixOperations()` - ~2 return statements
- `handleStatistics()` - ~2 return statements
- `handleUnitConversion()` - ~2 return statements

**Acceptance Criteria**:
- All responses have `isError` field
- Client code can reliably detect errors
- Type safety enforced
- All tests pass

---

## 🟡 TIER 2: Medium Tasks (3-5 weeks total)

### Sprint 2A: Error Handling & Performance (3 items)

#### Task 8: Fix Async Error Handling (Issue #9)
**Priority**: Medium-High
**Complexity**: 🟡 Medium
**Estimated Time**: 2-3 days
**Files**: `src/acceleration-router.ts`, `src/wasm-wrapper.ts`, `src/gpu/webgpu-wrapper.ts`

**Current State**:
```typescript
// Unhandled promise rejection
this.createWorker().then(() => {
  this.scheduleNextTask();
});
// No .catch() - will crash Node.js ≥15!
```

**Required Changes**:
1. Add `.catch()` handlers to all floating promises
2. Identified locations:
   - `acceleration-router.ts:263` - createWorker
   - `wasm-wrapper.ts:997` - initWASM
   - `gpu/webgpu-wrapper.ts:513` - initGPU
3. Pattern to use:
```typescript
this.createWorker()
  .then(() => {
    this.scheduleNextTask();
  })
  .catch((error) => {
    logger.error('Failed to create worker', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Handle gracefully - don't crash
  });
```

**Search Strategy**:
1. Grep for `.then(` without `.catch(`
2. Review all async function calls
3. Check for `Promise.resolve()` without error handling

**Acceptance Criteria**:
- No unhandled promise rejections
- All async errors logged
- Server doesn't crash on async errors
- Add test cases for async failures

---

#### Task 9: Replace `any` Types (Issue #11)
**Priority**: Medium
**Complexity**: 🟡 Medium
**Estimated Time**: 3-5 days
**Files**: Multiple

**Current State**:
```typescript
// 15+ occurrences of 'any'
let gpuDevice: any = null;
let wasmMatrix: any = null;
let wasmStats: any = null;
data: any;
```

**Required Changes**:
1. Define proper interfaces:
```typescript
// WASM bindings
interface WasmMatrixModule {
  multiply(a: Float64Array, rows_a: number, cols_a: number,
           b: Float64Array, rows_b: number, cols_b: number): Float64Array;
  determinant(matrix: Float64Array, size: number): number;
  transpose(matrix: Float64Array, rows: number, cols: number): Float64Array;
  add(a: Float64Array, b: Float64Array, size: number): Float64Array;
  subtract(a: Float64Array, b: Float64Array, size: number): Float64Array;
}

interface WasmStatsModule {
  mean(data: Float64Array, length: number): number;
  median(data: Float64Array, length: number): number;
  std(data: Float64Array, length: number): number;
  variance(data: Float64Array, length: number): number;
  min(data: Float64Array, length: number): number;
  max(data: Float64Array, length: number): number;
  sum(data: Float64Array, length: number): number;
  product(data: Float64Array, length: number): number;
  mode(data: Float64Array, length: number): Float64Array;
}

// GPU device
interface GPUDevice {
  // Define based on WebGPU spec
}

// Worker data
interface WorkerTaskData {
  operation: OperationType;
  matrixA?: number[][];
  matrixB?: number[][];
  data?: number[];
}
```

2. Replace all `any` occurrences with proper types
3. Update variable declarations
4. Add type assertions where needed

**Locations** (15+ total):
- `src/gpu/webgpu-wrapper.ts:52` - gpuDevice
- `src/wasm-wrapper.ts:81` - wasmMatrix
- `src/wasm-wrapper.ts:88` - wasmStats
- `src/workers/worker-pool.ts:346` - data
- `src/tool-handlers.ts` - result types

**Acceptance Criteria**:
- Zero `any` types in codebase
- TypeScript strict mode passes
- ESLint no-explicit-any error passes
- All tests pass

---

#### Task 10: Add Dependency Version Pinning (Issue #36)
**Priority**: Medium
**Complexity**: 🟡 Medium
**Estimated Time**: 1-2 days
**File**: `package.json`, `.github/dependabot.yml`

**Current State**:
```json
"mathjs": "^15.0.0"  // Allows 15.x.x - risky
```

**Required Changes**:
1. Remove `^` from all dependencies:
```json
"mathjs": "15.0.0",
"@modelcontextprotocol/sdk": "1.0.0",
```

2. Create `.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      production-dependencies:
        dependency-type: "production"
      development-dependencies:
        dependency-type: "development"
```

3. Document update process in CONTRIBUTING.md:
```markdown
## Updating Dependencies

1. Dependabot will create PRs for updates weekly
2. Review changelog for breaking changes
3. Run full test suite
4. Update package.json and package-lock.json
5. Test in production-like environment
```

**Acceptance Criteria**:
- All dependencies pinned to exact versions
- Dependabot configured and active
- Update process documented
- CI runs on dependency updates

---

### Sprint 2B: Configuration & Scaling (3 items)

#### Task 11: Fix TypeScript Configuration (Issue #33)
**Priority**: Medium
**Complexity**: 🟡 Medium
**Estimated Time**: 1 day
**File**: `tsconfig.json`

**Current State**:
```json
{
  "target": "ES2022",  // Very modern
  "module": "Node16"   // Requires Node 16+
}
```

**Issues**:
- package.json requires Node 18 but TS targets 16
- ES2022 features may not work in Node 18

**Required Changes**:
1. Align TypeScript target with Node 18:
```json
{
  "compilerOptions": {
    "target": "ES2022",        // Node 18 supports ES2022
    "module": "Node16",        // Keep Node16 for imports
    "moduleResolution": "Node16",
    "lib": ["ES2022"],         // Add lib for clarity
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,     // Verify types
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

2. Add build verification:
```json
// package.json
"scripts": {
  "build:verify": "npm run verify:dist && npm run verify:wasm && npm run verify:hashes",
  "verify:types": "tsc --noEmit --skipLibCheck false"
}
```

3. Test all ES2022 features used:
   - Top-level await
   - Private fields (#field)
   - Error.cause
   - Array.at()

**Acceptance Criteria**:
- TypeScript config aligns with Node 18
- Build verification works
- All ES2022 features tested
- No type errors

---

#### Task 12: Worker Pool Scaling to Zero (Issue #15)
**Priority**: Medium
**Complexity**: 🟡 Medium
**Estimated Time**: 1-2 days
**File**: `src/workers/worker-pool.ts`

**Current State**:
```typescript
// Workers never scale below minWorkers (default 2)
if (idleTime > this.config.workerIdleTimeout &&
    this.workers.size > this.config.minWorkers)
```

**Required Changes**:
1. Allow minWorkers = 0:
```typescript
interface WorkerPoolConfig {
  maxWorkers: number;
  minWorkers: number;  // Allow 0
  workerIdleTimeout: number;
  taskTimeout: number;
  maxQueueSize: number;
}
```

2. Update scaling logic:
```typescript
private async scaleDown(): Promise<void> {
  for (const [workerId, metadata] of this.workers) {
    const idleTime = Date.now() - metadata.lastUsed;

    // Scale to minWorkers (including 0)
    if (idleTime > this.config.workerIdleTimeout &&
        this.workers.size > this.config.minWorkers) {
      await this.terminateWorker(workerId);
    }
  }
}
```

3. Add environment variable:
```bash
MIN_WORKERS=0  # Allow scaling to zero
```

4. Handle zero workers state:
```typescript
async execute<T>(request: OperationRequest): Promise<T> {
  // If pool is empty, create worker on demand
  if (this.workers.size === 0) {
    await this.createWorker();
  }
  // ... rest of execution
}
```

**Acceptance Criteria**:
- Can configure MIN_WORKERS=0
- Pool scales to 0 during idle
- Workers created on demand
- No performance regression
- Tests for zero-worker state

---

#### Task 13: Benchmark Documentation (Issue #19, #40)
**Priority**: Medium
**Complexity**: 🟡 Medium
**Estimated Time**: 2-3 days
**Files**: `wasm/benchmarks/`, `README.md`, `docs/BENCHMARKS.md`

**Current State**:
- Performance claims in README not verified
- No benchmark methodology documented
- No reproducible benchmark code

**Required Changes**:
1. Create `docs/BENCHMARKS.md`:
```markdown
# Performance Benchmarks

## Methodology

**Hardware**:
- CPU: [Specify model]
- RAM: [Specify amount]
- OS: [Specify OS and version]
- Node.js: [Specify version]

**Test Setup**:
- Warm-up: 100 iterations
- Measurement: 1000 iterations
- Statistical method: Median of 5 runs
- Timeout: 60 seconds per test

## Results

### Matrix Operations

| Operation | Size | mathjs | WASM | Workers | Speedup |
|-----------|------|--------|------|---------|---------|
| multiply  | 10×10   | 0.50ms | 0.06ms | - | 8.3x |
| multiply  | 100×100 | 95ms | 12ms | 3ms | 31.7x |
...
```

2. Create benchmark scripts:
```typescript
// wasm/benchmarks/run-benchmarks.ts
import { performance } from 'perf_hooks';

function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 1000
): number {
  // Warm-up
  for (let i = 0; i < 100; i++) fn();

  // Measure
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  return (end - start) / iterations;
}
```

3. Update README with verified numbers
4. Add `npm run benchmark` script

**Acceptance Criteria**:
- Benchmark methodology documented
- Hardware specifications documented
- Reproducible benchmark code
- README updated with verified numbers
- Can run benchmarks locally

---

#### Task 14: Troubleshooting Guide for Workers (Issue #39)
**Priority**: Medium
**Complexity**: 🟡 Medium
**Estimated Time**: 1 day
**File**: `README.md`

**Current State**:
- No guidance on debugging worker failures
- No common issue documentation

**Required Changes**:
Add comprehensive troubleshooting section to README:

```markdown
## 🐛 Troubleshooting

### Worker Pool Issues

**Problem: Workers fail to initialize**

Symptoms:
```
[ERROR] Failed to create worker: Error: worker_threads not available
```

Solutions:
1. Check Node.js version: `node --version` (must be ≥18.0.0)
2. Verify worker_threads support:
   ```javascript
   const { isMainThread } = require('worker_threads');
   console.log('Worker threads available:', !isMainThread || true);
   ```
3. On some platforms, rebuild native modules:
   ```bash
   npm rebuild
   ```

**Problem: Worker crashes repeatedly**

Symptoms:
```
[WARN] Worker exited unexpectedly { workerId: '...', exitCode: 1 }
```

Solutions:
1. Check worker logs: `LOG_LEVEL=debug npm start`
2. Look for memory issues:
   ```bash
   node --max-old-space-size=4096 dist/index-wasm.js
   ```
3. Reduce worker count: `MAX_WORKERS=2 npm start`
4. Check for WASM corruption: `npm run build:wasm`

**Problem: Operations timeout**

Symptoms:
```
[ERROR] Operation timed out after 30000ms
```

Solutions:
1. Increase timeout: `OPERATION_TIMEOUT=60000 npm start`
2. Check input size (may be too large)
3. Monitor worker pool: `ENABLE_PERF_LOGGING=true npm start`

### WASM Issues

**Problem: WASM integrity verification fails**

Symptoms:
```
[ERROR] WASM integrity verification failed
```

Solutions:
1. Rebuild WASM modules:
   ```bash
   cd wasm && npm run clean && npx gulp && cd ..
   ```
2. Regenerate hashes:
   ```bash
   npm run generate:hashes
   ```
3. Check for file corruption: `ls -la wasm/build/`

### Performance Issues

**Problem: Not using WASM acceleration**

Check acceleration status:
```bash
LOG_LEVEL=debug npm start
# Look for: "Using mathjs for..." (should be "Using WASM for..." for large inputs)
```

Solutions:
1. Verify WASM initialized: Check startup logs for "WASM modules initialized successfully"
2. Check input sizes exceed thresholds (10×10 for matrices, 100 for statistics)
3. Enable performance logging: `ENABLE_PERF_LOGGING=true npm start`
```

**Acceptance Criteria**:
- Common issues documented
- Solutions provided
- Debugging steps clear
- Users can self-diagnose

---

## 🟠 TIER 3: Complex Tasks (7-12 weeks total)

### Sprint 3A: Optimization & Testing (3 items)

#### Task 15: Optimize Parallel Matrix Transpose (Issue #12)
**Priority**: Medium-High
**Complexity**: 🟠 Complex
**Estimated Time**: 1-2 weeks
**File**: `src/workers/parallel-matrix.ts`

**Current State**:
```typescript
// O(n³) complexity - inefficient!
const transposed: number[][] = Array(cols)
  .fill(null)
  .map(() => Array(rows).fill(0));

for (let chunkIdx = 0; chunkIdx < results.length; chunkIdx++) {
  for (let i = 0; i < transposedChunk.length; i++) {
    for (let j = 0; j < transposedChunk[i].length; j++) {
      transposed[i][currentRow + j] = transposedChunk[i][j];
    }
  }
}
```

**Problems**:
- Triple nested loop
- Random memory access (poor cache utilization)
- Pre-allocates entire output (memory spike)

**Required Changes**:
1. Implement streaming merge (O(n²)):
```typescript
function mergeTransposedChunks(
  chunks: number[][][],
  rows: number,
  cols: number
): number[][] {
  // Pre-allocate correctly
  const result = new Array(cols);
  for (let i = 0; i < cols; i++) {
    result[i] = new Array(rows);
  }

  // Merge with cache-friendly access
  let currentCol = 0;
  for (const chunk of chunks) {
    const chunkCols = chunk.length;
    for (let i = 0; i < chunkCols; i++) {
      result[currentCol + i] = chunk[i];
    }
    currentCol += chunkCols;
  }

  return result;
}
```

2. Optimize chunking strategy:
```typescript
// Chunk by columns, not rows (better for transpose)
function chunkMatrixByColumns(
  matrix: number[][],
  numChunks: number
): number[][][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const colsPerChunk = Math.ceil(cols / numChunks);

  const chunks: number[][][] = [];
  for (let i = 0; i < numChunks; i++) {
    const startCol = i * colsPerChunk;
    const endCol = Math.min(startCol + colsPerChunk, cols);

    // Extract column slice
    const chunk: number[][] = matrix.map(row =>
      row.slice(startCol, endCol)
    );
    chunks.push(chunk);
  }

  return chunks;
}
```

3. Add benchmarks to verify improvement
4. Update tests

**Acceptance Criteria**:
- Complexity reduced to O(n²)
- Memory usage optimized
- Benchmark shows improvement
- No correctness regressions
- Tests pass

---

#### Task 16: Add Mathematical Correctness Tests (Issue #27)
**Priority**: Medium-High
**Complexity**: 🟠 Complex
**Estimated Time**: 1 week
**File**: `test/correctness-tests.js` (new)

**Current State**:
```javascript
// Only checks types, not correctness!
const result = await wasmWrapper.matrixMultiply(a, b);
if (!Array.isArray(result) || result.length !== 2) {
  throw new Error('Invalid result');
}
// Doesn't verify result is CORRECT
```

**Required Changes**:
1. Create correctness test suite:
```javascript
// test/correctness-tests.js
import * as math from 'mathjs';
import { matrixMultiply, matrixDeterminant } from '../dist/wasm-wrapper.js';

function assertClose(actual, expected, tolerance = 1e-10) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `Expected ${expected}, got ${actual} (diff: ${diff})`
    );
  }
}

function testMatrixMultiply() {
  // Known test cases
  const testCases = [
    {
      name: '2x2 identity',
      a: [[1, 0], [0, 1]],
      b: [[5, 6], [7, 8]],
      expected: [[5, 6], [7, 8]]
    },
    {
      name: '2x2 standard',
      a: [[1, 2], [3, 4]],
      b: [[5, 6], [7, 8]],
      expected: [[19, 22], [43, 50]]
    },
    // Add 50+ more test cases
  ];

  for (const tc of testCases) {
    const result = matrixMultiply(tc.a, tc.b);
    const expected = math.multiply(tc.a, tc.b);

    // Compare each element
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < result[i].length; j++) {
        assertClose(result[i][j], expected[i][j]);
      }
    }
  }
}
```

2. Add property-based tests:
```javascript
function testMatrixMultiplyProperties() {
  for (let i = 0; i < 100; i++) {
    // Generate random matrices
    const size = Math.floor(Math.random() * 50) + 2;
    const a = randomMatrix(size, size);
    const b = randomMatrix(size, size);

    const result = matrixMultiply(a, b);
    const expected = math.multiply(a, b);

    // Compare with tolerance
    assertMatricesClose(result, expected, 1e-10);
  }
}
```

3. Add edge case tests:
```javascript
function testEdgeCases() {
  // Singular matrices
  // Near-zero determinants
  // Large numbers
  // Very small numbers
  // Special matrices (diagonal, symmetric, etc.)
}
```

4. Add to CI pipeline

**Acceptance Criteria**:
- 100+ correctness test cases
- Property-based testing
- Edge cases covered
- All tests pass
- CI integration

---

#### Task 17: Refactor Module Dependencies (Issue #29)
**Priority**: Medium
**Complexity**: 🟠 Complex
**Estimated Time**: 1-2 weeks
**Files**: Multiple

**Current State**:
```
acceleration-router.ts
  ↓ imports
wasm-wrapper.ts
  ↓ imports
utils.ts (logger)
  ↓ could import
acceleration-router.ts (for stats)  ← CIRCULAR!
```

**Required Changes**:
1. Extract shared utilities:
```typescript
// src/shared/logger.ts (new)
// Move logger from utils.ts

// src/shared/types.ts (new)
// Move shared types

// src/shared/constants.ts (new)
// Move shared constants
```

2. Create clear dependency layers:
```
Layer 1 (No dependencies):
  - shared/logger.ts
  - shared/types.ts
  - shared/constants.ts

Layer 2 (Depends on Layer 1):
  - errors.ts
  - validation.ts
  - utils.ts

Layer 3 (Depends on Layers 1-2):
  - wasm-wrapper.ts
  - workers/worker-pool.ts
  - gpu/webgpu-wrapper.ts

Layer 4 (Depends on Layers 1-3):
  - acceleration-router.ts
  - acceleration-adapter.ts

Layer 5 (Depends on all):
  - tool-handlers.ts
  - index-wasm.ts
```

3. Add dependency checks:
```typescript
// scripts/check-dependencies.ts
import * as ts from 'typescript';

function checkCircularDependencies() {
  // Parse all TypeScript files
  // Build dependency graph
  // Detect cycles
  // Fail if cycles found
}
```

4. Update imports throughout

**Acceptance Criteria**:
- No circular dependencies
- Clear layered architecture
- Dependency check in CI
- All tests pass
- No runtime issues

---

### Sprint 3B: Architecture Improvements (3 items)

#### Task 18: Explicit Graceful Degradation (Issue #30)
**Priority**: Medium
**Complexity**: 🟠 Complex
**Estimated Time**: 1-2 weeks
**File**: `src/acceleration-router.ts`

**Current State**:
```typescript
// Implicit fallback
try { GPU } catch { try { Workers } catch { try { WASM } catch { mathjs }}}
```

**Required Changes**:
1. Define explicit degradation policy:
```typescript
// src/degradation-policy.ts (new)
export enum AccelerationTier {
  MATHJS = 0,
  WASM = 1,
  WORKERS = 2,
  GPU = 3,
}

export interface DegradationPolicy {
  enabledTiers: Set<AccelerationTier>;
  preferredTier: AccelerationTier;
  fallbackChain: AccelerationTier[];
  notifyOnDegradation: boolean;
}

export function createDefaultPolicy(): DegradationPolicy {
  return {
    enabledTiers: new Set([
      AccelerationTier.MATHJS,
      AccelerationTier.WASM,
      AccelerationTier.WORKERS,
      // AccelerationTier.GPU - disabled by default
    ]),
    preferredTier: AccelerationTier.GPU,
    fallbackChain: [
      AccelerationTier.GPU,
      AccelerationTier.WORKERS,
      AccelerationTier.WASM,
      AccelerationTier.MATHJS,
    ],
    notifyOnDegradation: true,
  };
}
```

2. Implement configurable routing:
```typescript
export class AccelerationRouter {
  private policy: DegradationPolicy;

  constructor(policy?: DegradationPolicy) {
    this.policy = policy || createDefaultPolicy();
  }

  async route<T>(
    operation: Operation,
    data: any
  ): Promise<T> {
    for (const tier of this.policy.fallbackChain) {
      if (!this.policy.enabledTiers.has(tier)) {
        continue; // Skip disabled tiers
      }

      try {
        const result = await this.executeOnTier(tier, operation, data);
        if (this.policy.notifyOnDegradation && tier !== this.policy.preferredTier) {
          logger.warn('Degraded to lower tier', {
            operation,
            tier: AccelerationTier[tier],
            preferred: AccelerationTier[this.policy.preferredTier],
          });
        }
        return result;
      } catch (error) {
        logger.debug('Tier failed, trying next', {
          tier: AccelerationTier[tier],
          error,
        });
      }
    }

    throw new Error('All acceleration tiers failed');
  }
}
```

3. Add environment variable configuration:
```bash
# Enable/disable tiers
ENABLE_GPU=false        # Disable GPU tier
ENABLE_WORKERS=true     # Enable workers
ENABLE_WASM=true        # Enable WASM
ENABLE_MATHJS=true      # Always true (fallback)

# Degradation notifications
NOTIFY_DEGRADATION=true
```

4. Update README with configuration options

**Acceptance Criteria**:
- Explicit degradation policy
- Configurable tier enabling/disabling
- User notifications of degradation
- Environment variable control
- Tests for all configurations

---

#### Task 19: Dependency Injection for Worker Pool (Issue #31)
**Priority**: Medium
**Complexity**: 🟠 Complex
**Estimated Time**: 2-3 weeks
**Files**: `src/acceleration-router.ts`, `src/workers/worker-pool.ts`

**Current State**:
```typescript
// Global singleton
let workerPool: WorkerPool | null = null;
```

**Required Changes**:
1. Remove global state:
```typescript
// src/acceleration-router.ts
export class AccelerationRouter {
  private workerPool: WorkerPool | null = null;

  constructor(
    private config: RouterConfig = defaultConfig,
    workerPool?: WorkerPool
  ) {
    this.workerPool = workerPool || null;
  }

  async initialize(): Promise<void> {
    if (this.config.enableWorkers) {
      this.workerPool = new WorkerPool(this.config.workerPoolConfig);
      await this.workerPool.initialize();
    }
  }
}
```

2. Support multiple pools:
```typescript
// src/workers/pool-manager.ts (new)
export class WorkerPoolManager {
  private pools: Map<string, WorkerPool> = new Map();

  createPool(
    name: string,
    config: WorkerPoolConfig
  ): WorkerPool {
    const pool = new WorkerPool(config);
    this.pools.set(name, pool);
    return pool;
  }

  getPool(name: string): WorkerPool | undefined {
    return this.pools.get(name);
  }

  async shutdownAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.shutdown();
    }
    this.pools.clear();
  }
}

// Usage: Separate pools for matrix vs stats
const manager = new WorkerPoolManager();
const matrixPool = manager.createPool('matrix', { maxWorkers: 4 });
const statsPool = manager.createPool('stats', { maxWorkers: 4 });
```

3. Update index-wasm.ts:
```typescript
// src/index-wasm.ts
const router = new AccelerationRouter({
  enableWorkers: true,
  workerPoolConfig: {
    maxWorkers: parseInt(process.env.MAX_WORKERS || '8', 10),
    minWorkers: parseInt(process.env.MIN_WORKERS || '2', 10),
  },
});

await router.initialize();

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Router injected, not global
  return router.route(request);
});
```

4. Add tests with mocked pools:
```typescript
// test/unit/acceleration-router.test.ts
describe('AccelerationRouter', () => {
  it('should use injected worker pool', async () => {
    const mockPool = new MockWorkerPool();
    const router = new AccelerationRouter({}, mockPool);

    await router.initialize();
    // Test with mock pool
  });
});
```

**Acceptance Criteria**:
- No global singleton
- Dependency injection pattern
- Multiple pools supported
- Testable with mocks
- All tests pass
- No breaking changes

---

#### Task 20: Implement Backpressure (Issue #32)
**Priority**: Medium
**Complexity**: 🟠 Complex
**Estimated Time**: 1-2 weeks
**File**: `src/workers/task-queue.ts`

**Current State**:
```typescript
// Fails immediately when queue full
if (this.queue.length >= this.maxQueueSize) {
  task.reject(new Error('Queue full'));
}
```

**Required Changes**:
1. Implement backpressure with retry:
```typescript
// src/workers/backpressure.ts (new)
export class BackpressureQueue<T> {
  private queue: Array<QueuedTask<T>> = [];
  private readonly maxSize: number;
  private readonly strategy: BackpressureStrategy;

  constructor(config: BackpressureConfig) {
    this.maxSize = config.maxSize;
    this.strategy = config.strategy;
  }

  async enqueue(
    task: Task<T>,
    options?: EnqueueOptions
  ): Promise<T> {
    if (this.queue.length >= this.maxSize) {
      return this.handleBackpressure(task, options);
    }

    return this.addToQueue(task);
  }

  private async handleBackpressure<T>(
    task: Task<T>,
    options?: EnqueueOptions
  ): Promise<T> {
    switch (this.strategy) {
      case BackpressureStrategy.REJECT:
        throw new BackpressureError('Queue full', {
          queueSize: this.queue.length,
          maxSize: this.maxSize,
          suggestedRetryAfter: this.estimateWaitTime(),
        });

      case BackpressureStrategy.WAIT:
        // Wait for queue to drain
        await this.waitForSpace();
        return this.addToQueue(task);

      case BackpressureStrategy.SHED:
        // Drop lowest priority task
        this.dropLowestPriority();
        return this.addToQueue(task);
    }
  }

  private estimateWaitTime(): number {
    // Calculate based on average task duration
    const avgDuration = this.getAverageTaskDuration();
    const queuedTasks = this.queue.length;
    return avgDuration * queuedTasks;
  }
}
```

2. Return 503 with retry information:
```typescript
// src/errors.ts
export class BackpressureError extends MathMCPError {
  constructor(
    message: string,
    public readonly metadata: {
      queueSize: number;
      maxSize: number;
      suggestedRetryAfter: number; // milliseconds
    }
  ) {
    super(message);
    this.name = 'BackpressureError';
  }
}

// src/index-wasm.ts
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await router.route(request);
  } catch (error) {
    if (error instanceof BackpressureError) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Service temporarily unavailable',
            retryAfter: error.metadata.suggestedRetryAfter,
            queueStatus: {
              current: error.metadata.queueSize,
              max: error.metadata.maxSize,
            },
          }),
        }],
        isError: true,
        _meta: {
          statusCode: 503,
          retryAfter: error.metadata.suggestedRetryAfter,
        },
      };
    }
    throw error;
  }
});
```

3. Add exponential backoff client-side example:
```typescript
// docs/CLIENT_EXAMPLE.md
async function callWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.statusCode === 503 && attempt < maxRetries - 1) {
        const retryAfter = error.retryAfter || (1000 * Math.pow(2, attempt));
        await sleep(retryAfter);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

4. Add queue drain events:
```typescript
export class BackpressureQueue<T> extends EventEmitter {
  private checkDrainThreshold() {
    const drainThreshold = this.maxSize * 0.2; // 20%
    if (this.queue.length <= drainThreshold && this.wasAboveThreshold) {
      this.emit('drain', {
        queueSize: this.queue.length,
        maxSize: this.maxSize,
      });
      this.wasAboveThreshold = false;
    }
  }
}
```

**Acceptance Criteria**:
- Backpressure strategies implemented
- 503 responses with retry-after
- Exponential backoff documented
- Queue drain events
- Tests for all strategies
- Load testing passes

---

## 🔴 TIER 4: Major Tasks (11-16 weeks total)

### Sprint 4A: Testing Infrastructure (3 items)

#### Task 21: Comprehensive Unit Tests (Issue #26)
**Priority**: High
**Complexity**: 🔴 Major
**Estimated Time**: 4-6 weeks
**Files**: `test/unit/` (new directory)

**Current State**:
- Only 11 integration tests
- No unit tests
- No mocking
- ~15-20% estimated coverage

**Required Changes**:
1. Set up Vitest (already configured):
```bash
npm install --save-dev vitest @vitest/ui
```

2. Create unit test structure:
```
test/
├── integration/
│   └── integration-test.js (existing)
└── unit/
    ├── validation.test.ts
    ├── errors.test.ts
    ├── utils.test.ts
    ├── wasm-wrapper.test.ts
    ├── workers/
    │   ├── worker-pool.test.ts
    │   ├── task-queue.test.ts
    │   ├── parallel-matrix.test.ts
    │   └── parallel-stats.test.ts
    ├── acceleration-router.test.ts
    ├── acceleration-adapter.test.ts
    ├── tool-handlers.test.ts
    ├── rate-limiter.test.ts
    ├── wasm-integrity.test.ts
    └── expression-cache.test.ts
```

3. Write comprehensive tests for each module (examples):

```typescript
// test/unit/validation.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateExpression,
  validateMatrix,
  validateArray,
  safeJsonParse,
} from '../../src/validation.js';

describe('validateExpression', () => {
  it('should accept valid expressions', () => {
    expect(() => validateExpression('2 + 2')).not.toThrow();
    expect(() => validateExpression('x^2 + 2*x')).not.toThrow();
  });

  it('should reject expressions exceeding max length', () => {
    const longExpr = 'x'.repeat(10001);
    expect(() => validateExpression(longExpr))
      .toThrow('exceeds maximum length');
  });

  it('should reject expressions with excessive nesting', () => {
    const deepNested = '('.repeat(51) + 'x' + ')'.repeat(51);
    expect(() => validateExpression(deepNested))
      .toThrow('exceeds maximum nesting');
  });
});

describe('validateMatrix', () => {
  it('should accept valid matrices', () => {
    expect(() => validateMatrix([[1, 2], [3, 4]])).not.toThrow();
  });

  it('should reject non-array input', () => {
    expect(() => validateMatrix('not an array'))
      .toThrow('must be an array');
  });

  it('should reject empty matrices', () => {
    expect(() => validateMatrix([]))
      .toThrow('cannot be empty');
  });

  it('should reject non-rectangular matrices', () => {
    expect(() => validateMatrix([[1, 2], [3]]))
      .toThrow('must be rectangular');
  });

  it('should reject matrices exceeding size limit', () => {
    const large = Array(1001).fill(Array(1001).fill(1));
    expect(() => validateMatrix(large))
      .toThrow('exceeds maximum size');
  });
});

// test/unit/rate-limiter.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxRequestsPerWindow: 10,
      windowMs: 1000,
      maxConcurrent: 5,
      maxQueueSize: 10,
    });
  });

  it('should allow requests under limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.allowRequest()).toBe(true);
    }
  });

  it('should deny requests over limit', () => {
    for (let i = 0; i < 10; i++) {
      limiter.allowRequest();
    }
    expect(limiter.allowRequest()).toBe(false);
  });

  it('should reset after window', async () => {
    for (let i = 0; i < 10; i++) {
      limiter.allowRequest();
    }

    // Wait for window to reset
    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(limiter.allowRequest()).toBe(true);
  });

  it('should track concurrent requests', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(limiter.withRateLimit(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      }));
    }

    // 6th request should wait
    const start = Date.now();
    await limiter.withRateLimit(async () => {});
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThan(90); // Waited for slot
  });
});

// test/unit/wasm-wrapper.test.ts
import { describe, it, expect, vi } from 'vitest';
import * as wasmWrapper from '../../src/wasm-wrapper.js';

// Mock WASM modules
vi.mock('../../wasm/bindings/matrix.cjs', () => ({
  multiply: vi.fn((a, rows_a, cols_a, b, rows_b, cols_b) => {
    // Return mock result
    return new Float64Array(rows_a * cols_b);
  }),
}));

describe('wasm-wrapper', () => {
  describe('matrixMultiply', () => {
    it('should use mathjs for small matrices', async () => {
      const a = [[1, 2], [3, 4]];
      const b = [[5, 6], [7, 8]];
      const result = await wasmWrapper.matrixMultiply(a, b);

      expect(result).toEqual([[19, 22], [43, 50]]);
    });

    it('should use WASM for large matrices', async () => {
      const size = 20;
      const a = Array(size).fill(null).map(() => Array(size).fill(1));
      const b = Array(size).fill(null).map(() => Array(size).fill(1));

      const result = await wasmWrapper.matrixMultiply(a, b);

      expect(result.length).toBe(size);
      expect(result[0].length).toBe(size);
    });
  });
});
```

4. Add mocking utilities:
```typescript
// test/mocks/worker-pool.mock.ts
export class MockWorkerPool {
  async execute<T>(request: OperationRequest): Promise<T> {
    // Return mock result immediately
    return Promise.resolve({} as T);
  }

  async shutdown(): Promise<void> {}

  getStats() {
    return {
      activeWorkers: 0,
      queuedTasks: 0,
    };
  }
}
```

5. Configure coverage:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/gpu/**', // Future implementation
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

6. Add npm scripts:
```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:all": "npm run test:unit && npm test"
  }
}
```

**Target Coverage by Module**:
- `validation.ts`: 95%+ (pure functions, easy to test)
- `errors.ts`: 90%+ (error classes)
- `utils.ts`: 85%+ (utilities and logger)
- `rate-limiter.ts`: 90%+ (new code, should be well-tested)
- `wasm-integrity.ts`: 85%+ (file I/O makes 100% difficult)
- `expression-cache.ts`: 90%+ (cache logic)
- `tool-handlers.ts`: 75%+ (complex integration logic)
- `wasm-wrapper.ts`: 70%+ (WASM integration)
- `workers/`: 70%+ (worker integration)
- `acceleration-router.ts`: 70%+ (routing logic)

**Acceptance Criteria**:
- 80%+ overall code coverage
- All modules have unit tests
- Mocking strategy in place
- Tests run fast (<10 seconds)
- CI integration
- Coverage reports generated

---

#### Task 22: Security Testing Suite (Issue #28)
**Priority**: High
**Complexity**: 🔴 Major
**Estimated Time**: 3-4 weeks
**Files**: `test/security/` (new directory)

**Current State**:
- No security tests
- No injection testing
- No DoS resilience testing
- No fuzzing

**Required Changes**:
1. Create security test structure:
```
test/
└── security/
    ├── injection-tests.ts
    ├── dos-tests.ts
    ├── fuzzing-tests.ts
    ├── bounds-tests.ts
    └── malicious-payload-tests.ts
```

2. Injection attack tests:
```typescript
// test/security/injection-tests.ts
import { describe, it, expect } from 'vitest';
import { handleEvaluate } from '../../src/tool-handlers.js';

describe('Code Injection Prevention', () => {
  const maliciousExpressions = [
    // Function definitions
    'function attack() { while(true) {} }; attack()',
    'f = function() { return 1; }; f()',

    // Assignments
    'x = 1; process.exit()',
    'global.hacked = true',

    // Import attempts
    'import("child_process")',
    'require("fs")',

    // Prototype pollution
    '__proto__.polluted = true',
    'constructor.prototype.polluted = true',

    // Accessing private internals
    'process.env.SECRET_KEY',
    'global.process.exit()',
  ];

  it('should block dangerous function definitions', async () => {
    for (const expr of maliciousExpressions) {
      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/not allowed|invalid|blocked/i);
    }
  });

  it('should block code execution via toString', async () => {
    const obj = {
      toString: () => {
        throw new Error('Should not execute');
      },
    };

    await expect(
      handleEvaluate({
        expression: 'x',
        scope: JSON.stringify({ x: obj }),
      })
    ).rejects.toThrow();
  });
});
```

3. DoS resilience tests:
```typescript
// test/security/dos-tests.ts
import { describe, it, expect } from 'vitest';
import { globalRateLimiter } from '../../src/rate-limiter.js';

describe('DoS Protection', () => {
  it('should limit request rate', async () => {
    // Flood with requests
    const requests = Array(200).fill(null).map(() =>
      handleEvaluate({ expression: '2+2' })
    );

    const results = await Promise.allSettled(requests);

    // Should have rejections due to rate limiting
    const rejected = results.filter(r => r.status === 'rejected');
    expect(rejected.length).toBeGreaterThan(0);
  });

  it('should timeout long operations', async () => {
    // Create expensive operation
    const largeMatrix = Array(500).fill(null)
      .map(() => Array(500).fill(1));

    const start = Date.now();
    await expect(
      handleMatrixOperations({
        operation: 'multiply',
        matrix_a: JSON.stringify(largeMatrix),
        matrix_b: JSON.stringify(largeMatrix),
      })
    ).rejects.toThrow(/timeout/i);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(35000); // Should timeout before 35s
  });

  it('should reject oversized JSON', async () => {
    // 25MB JSON (exceeds 20MB limit)
    const huge = Array(2500000).fill(1);
    const json = JSON.stringify(huge);

    expect(json.length).toBeGreaterThan(20 * 1024 * 1024);

    await expect(
      handleStatistics({
        operation: 'mean',
        data: json,
      })
    ).rejects.toThrow(/exceeds maximum size/i);
  });

  it('should limit concurrent operations', async () => {
    // Start many slow operations
    const operations = Array(50).fill(null).map(() =>
      handleStatistics({
        operation: 'median',
        data: JSON.stringify(Array(10000).fill(1)),
      })
    );

    // Some should be queued/rejected
    const results = await Promise.allSettled(operations);
    const rejected = results.filter(r => r.status === 'rejected');

    // Should have some rejections or significant delays
    expect(rejected.length > 0 || results.length > 20).toBe(true);
  });
});
```

4. Fuzzing tests:
```typescript
// test/security/fuzzing-tests.ts
import { describe, it } from 'vitest';
import { randomBytes } from 'crypto';

describe('Fuzzing Tests', () => {
  it('should handle random expression inputs', async () => {
    for (let i = 0; i < 1000; i++) {
      const randomExpr = randomBytes(Math.floor(Math.random() * 100))
        .toString('utf8');

      try {
        await handleEvaluate({ expression: randomExpr });
      } catch (error) {
        // Should throw ValidationError, not crash
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toMatch(/ValidationError|MathError/);
      }
    }
  });

  it('should handle random matrix inputs', async () => {
    for (let i = 0; i < 100; i++) {
      const randomData = randomBytes(1000).toString('base64');

      try {
        await handleMatrixOperations({
          operation: 'determinant',
          matrix_a: randomData,
        });
      } catch (error) {
        // Should throw ValidationError, not crash
        expect(error).toBeInstanceOf(Error);
      }
    }
  });
});
```

5. Bounds testing:
```typescript
// test/security/bounds-tests.ts
describe('Bounds Testing', () => {
  it('should reject matrices exceeding size limit', async () => {
    const oversized = Array(1001).fill(Array(1001).fill(1));

    await expect(
      handleMatrixOperations({
        operation: 'determinant',
        matrix_a: JSON.stringify(oversized),
      })
    ).rejects.toThrow(/exceeds maximum size/i);
  });

  it('should reject arrays exceeding length limit', async () => {
    const oversized = Array(100001).fill(1);

    await expect(
      handleStatistics({
        operation: 'mean',
        data: JSON.stringify(oversized),
      })
    ).rejects.toThrow(/exceeds maximum length/i);
  });

  it('should handle edge case numbers', async () => {
    const edgeCases = [
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NaN,
      0,
      -0,
      Number.EPSILON,
    ];

    for (const val of edgeCases) {
      const result = await handleEvaluate({
        expression: 'x * 2',
        scope: JSON.stringify({ x: val }),
      });

      // Should return result, not crash
      expect(result).toBeDefined();
    }
  });
});
```

6. Add to CI pipeline:
```yaml
# .github/workflows/security-tests.yml
name: Security Tests

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:security
      - run: npm run test:fuzz
```

**Acceptance Criteria**:
- Injection attack tests (50+ test cases)
- DoS resilience tests
- Fuzzing tests (1000+ random inputs)
- Bounds tests
- All tests pass
- CI integration
- No crashes on malicious input

---

#### Task 23: Telemetry and Observability (Issue #22)
**Priority**: Medium-High
**Complexity**: 🔴 Major
**Estimated Time**: 4-6 weeks
**Files**: `src/telemetry/` (new directory)

**Current State**:
- No metrics export
- No tracing
- No health checks
- No alerting capability

**Required Changes**:
1. Add Prometheus metrics:
```typescript
// src/telemetry/metrics.ts
import promClient from 'prom-client';

// Create registry
export const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
export const operationDuration = new promClient.Histogram({
  name: 'math_mcp_operation_duration_seconds',
  help: 'Duration of math operations',
  labelNames: ['operation', 'tier'],
  buckets: [0.001, 0.01, 0.1, 1, 10],
  registers: [register],
});

export const operationCount = new promClient.Counter({
  name: 'math_mcp_operation_total',
  help: 'Total number of operations',
  labelNames: ['operation', 'tier', 'status'],
  registers: [register],
});

export const queueSize = new promClient.Gauge({
  name: 'math_mcp_queue_size',
  help: 'Current queue size',
  labelNames: ['type'],
  registers: [register],
});

export const workerCount = new promClient.Gauge({
  name: 'math_mcp_workers',
  help: 'Number of active workers',
  labelNames: ['state'],
  registers: [register],
});

export const rateLimitHits = new promClient.Counter({
  name: 'math_mcp_rate_limit_hits_total',
  help: 'Number of rate limit hits',
  registers: [register],
});
```

2. Add OpenTelemetry tracing:
```typescript
// src/telemetry/tracing.ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

export function setupTracing() {
  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'math-mcp',
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version,
    }),
  });

  if (process.env.JAEGER_ENDPOINT) {
    const exporter = new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT,
    });
    provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  }

  provider.register();

  return provider;
}

// Usage in tool handlers
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('math-mcp');

export async function handleEvaluate(args: EvaluateArgs) {
  return tracer.startActiveSpan('evaluate', async (span) => {
    try {
      span.setAttribute('expression.length', args.expression.length);
      const result = await evaluate(args.expression, args.scope);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

3. Add health check endpoint:
```typescript
// src/health.ts
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    wasm: HealthCheck;
    workers: HealthCheck;
    rateLimit: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  details?: Record<string, unknown>;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const checks = {
    wasm: await checkWasm(),
    workers: await checkWorkers(),
    rateLimit: await checkRateLimit(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'pass');
  const anyFailed = Object.values(checks).some(c => c.status === 'fail');

  return {
    status: anyFailed ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || 'unknown',
    checks,
  };
}

async function checkWasm(): Promise<HealthCheck> {
  if (!wasmInitialized) {
    return {
      status: 'warn',
      message: 'WASM not initialized, using mathjs fallback',
    };
  }

  try {
    // Quick test
    await matrixMultiply([[1, 2], [3, 4]], [[1, 0], [0, 1]]);
    return { status: 'pass' };
  } catch (error) {
    return {
      status: 'fail',
      message: 'WASM health check failed',
      details: { error: String(error) },
    };
  }
}

async function checkWorkers(): Promise<HealthCheck> {
  const pool = getWorkerPool();
  if (!pool) {
    return {
      status: 'warn',
      message: 'Worker pool not initialized',
    };
  }

  const stats = pool.getStats();
  if (stats.activeWorkers === 0 && stats.queuedTasks > 0) {
    return {
      status: 'warn',
      message: 'No active workers but tasks queued',
      details: stats,
    };
  }

  return { status: 'pass', details: stats };
}
```

4. Add metrics export endpoint (optional HTTP server):
```typescript
// src/telemetry/server.ts
import http from 'http';
import { register } from './metrics.js';
import { getHealthStatus } from '../health.js';

export function startTelemetryServer(port: number = 9090) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } else if (req.url === '/health') {
      const health = await getHealthStatus();
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = health.status === 'healthy' ? 200 : 503;
      res.end(JSON.stringify(health, null, 2));
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    logger.info('Telemetry server listening', { port });
  });

  return server;
}
```

5. Instrument existing code:
```typescript
// Update tool handlers to record metrics
export async function handleMatrixOperations(args: MatrixArgs) {
  const timer = operationDuration.startTimer({ operation: 'matrix', tier: 'unknown' });

  try {
    const result = await matrixOperations(args.operation, args.matrix_a, args.matrix_b);

    timer({ tier: 'wasm' }); // or 'mathjs'
    operationCount.inc({ operation: 'matrix', tier: 'wasm', status: 'success' });

    return result;
  } catch (error) {
    timer({ tier: 'error' });
    operationCount.inc({ operation: 'matrix', tier: 'error', status: 'error' });
    throw error;
  }
}
```

6. Configuration:
```bash
# Enable telemetry
ENABLE_METRICS=true
METRICS_PORT=9090

# OpenTelemetry
JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_SERVICE_NAME=math-mcp
```

**Acceptance Criteria**:
- Prometheus metrics exported
- OpenTelemetry tracing working
- Health check endpoint functional
- Metrics documented
- Grafana dashboard example
- Production-ready observability

---

## Sprint Planning

### Recommended Implementation Order

**Sprint 1: Quick Wins (2-3 days)**
- Tasks 1-7 (Simple tasks)
- Low risk, high value
- Builds confidence

**Sprint 2: Stability & Quality (2 weeks)**
- Tasks 8-10 (Error handling, types, dependencies)
- Critical for reliability
- Reduces technical debt

**Sprint 3: Configuration & Docs (1 week)**
- Tasks 11-14 (Configuration, benchmarks, troubleshooting)
- Improves user experience
- Documents current state

**Sprint 4: Performance (2 weeks)**
- Task 15 (Optimize transpose)
- Visible performance improvements
- Measurable impact

**Sprint 5: Architecture (3 weeks)**
- Tasks 16-20 (Testing, refactoring, degradation, DI, backpressure)
- Largest architectural improvements
- Foundation for future work

**Sprint 6: Testing Foundation (4-6 weeks)**
- Task 21 (Unit tests)
- Critical for maintainability
- Should be done before other major work

**Sprint 7: Security Hardening (3-4 weeks)**
- Task 22 (Security tests)
- Essential for production
- Builds on unit testing

**Sprint 8: Production Readiness (4-6 weeks)**
- Task 23 (Telemetry)
- Final piece for production deployment
- Enables monitoring and alerting

---

## Success Metrics

### Code Quality
- Test coverage: 80%+
- Zero `any` types
- No circular dependencies
- All JSDoc complete

### Performance
- Transpose optimization: 2-3x improvement
- No performance regressions
- Documented benchmarks

### Security
- All injection attacks blocked
- DoS protection working
- Fuzzing passes
- Security tests in CI

### Observability
- Prometheus metrics exported
- Health checks working
- Tracing enabled
- Production monitoring ready

---

## Risk Management

### High-Risk Tasks
1. **Task 9** (Replace `any`): May reveal type errors
2. **Task 15** (Optimize transpose): Algorithm complexity
3. **Task 19** (DI refactoring): Large architectural change
4. **Task 21** (Unit tests): Time-consuming

### Mitigation Strategies
- Incremental implementation
- Comprehensive testing at each step
- Feature flags for new functionality
- Maintain backward compatibility
- Regular code reviews

---

## Dependencies

### External Dependencies
- Prometheus client (`prom-client`)
- OpenTelemetry (`@opentelemetry/*`)
- Vitest (already configured)
- Additional testing tools

### Internal Dependencies
- Tasks 8-10 should be done before Task 19
- Task 21 should be done before Task 22
- Task 11 should be done early (affects all builds)

---

## Timeline Summary

| Phase | Tasks | Duration | Priority |
|-------|-------|----------|----------|
| Sprint 1 | 1-7 | 2-3 days | High |
| Sprint 2 | 8-10 | 2 weeks | High |
| Sprint 3 | 11-14 | 1 week | Medium |
| Sprint 4 | 15 | 2 weeks | Medium |
| Sprint 5 | 16-20 | 3 weeks | Medium |
| Sprint 6 | 21 | 4-6 weeks | High |
| Sprint 7 | 22 | 3-4 weeks | High |
| Sprint 8 | 23 | 4-6 weeks | Medium |

**Total Estimated Time**: 5-8 months

**Minimum Viable Improvements** (Sprints 1-3): ~3-4 weeks
**Production Ready** (Sprints 1-7): ~4-5 months
**Full Implementation** (All sprints): ~5-8 months
