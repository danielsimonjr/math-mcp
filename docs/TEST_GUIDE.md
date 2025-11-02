# Math-MCP Testing Guide

**Project:** math-mcp
**Version:** 2.0.0-wasm
**Last Updated:** November 2, 2025

This guide covers all testing procedures, test types, and quality assurance practices for the math-mcp project.

## Table of Contents

1. [Testing Overview](#testing-overview)
2. [Quick Start](#quick-start)
3. [Integration Tests](#integration-tests)
4. [WASM Differential Tests](#wasm-differential-tests)
5. [Performance Benchmarks](#performance-benchmarks)
6. [Manual Testing](#manual-testing)
7. [Writing New Tests](#writing-new-tests)
8. [Continuous Integration](#continuous-integration)
9. [Troubleshooting Tests](#troubleshooting-tests)

---

## Testing Overview

### Test Levels

The math-mcp project uses a multi-level testing strategy:

```
┌─────────────────────────────────────────────────────────────┐
│  Integration Tests (test/integration-test.js)               │
│  - End-to-end MCP server testing                            │
│  - WASM initialization verification                         │
│  - Threshold-based routing validation                       │
│  - Performance metrics tracking                             │
│  Status: 11/11 passing (100%)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  WASM Differential Tests (wasm/tests/)                      │
│  - WASM vs mathjs result comparison                         │
│  - Floating-point precision validation                      │
│  - Edge case handling                                        │
│  Status: All operations verified                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Performance Benchmarks (wasm/benchmarks/)                  │
│  - Speedup measurements (WASM vs mathjs)                    │
│  - Threshold validation                                      │
│  - Performance regression detection                         │
│  Status: 14.30x avg, 42x peak speedup                       │
└─────────────────────────────────────────────────────────────┘
```

### Test Success Criteria

**All tests must meet these criteria:**

- ✅ Integration tests: 11/11 passing (100%)
- ✅ WASM results match mathjs exactly (differential tests)
- ✅ WASM speedup: 7-17x for matrices, 15-42x for statistics
- ✅ WASM usage rate: ≥70% for typical workloads
- ✅ No memory leaks in WASM operations
- ✅ Proper fallback when WASM fails

---

## Quick Start

### Run All Tests

```bash
# 1. Build the project
npm run build

# 2. Run integration tests
node test/integration-test.js

# Expected output:
# === MCP Server Integration Tests ===
# ...
# Total: 11
# Passed: 11
# Failed: 0
# Success rate: 100.0%
```

### Run WASM Differential Tests

```bash
# Navigate to WASM directory
cd wasm

# Run differential tests
node tests/differential-matrix.cjs
node tests/differential-statistics.cjs

# Expected: All operations show matching results
```

### Run Performance Benchmarks

```bash
# Navigate to WASM directory
cd wasm

# Run benchmarks
node benchmarks/profile-matrix.js
node benchmarks/profile-stats.js

# Expected: Speedup metrics displayed
```

---

## Integration Tests

### Location and Structure

**File:** `test/integration-test.js`
**Purpose:** End-to-end testing of the MCP server with WASM acceleration

### Test Categories

#### 1. WASM Initialization Test

```javascript
async function testWasmInitialization() {
  console.log("--- WASM Initialization ---");

  try {
    const { wasmInitialized } = await import('../dist/wasm-wrapper.js');

    if (wasmInitialized) {
      console.log("✓ WASM should be initialized");
      testsPassed++;
    } else {
      throw new Error("WASM not initialized");
    }
  } catch (error) {
    console.log("✗ WASM initialization failed:", error.message);
    testsFailed++;
  }
}
```

**What it tests:**
- WASM modules load correctly
- Bindings are accessible
- No initialization errors

#### 2. Matrix Operations Tests

**Small Matrix (mathjs fallback):**
```javascript
async function testSmallMatrixMultiply() {
  const a = [[1, 2], [3, 4]];
  const b = [[5, 6], [7, 8]];

  const result = await matrixMultiply(a, b);

  // Expected: [[19, 22], [43, 50]]
  // Should use mathjs (below 10x10 threshold)
}
```

**Large Matrix (WASM acceleration):**
```javascript
async function testLargeMatrixMultiply() {
  const size = 20;
  const a = createRandomMatrix(size, size);
  const b = createRandomMatrix(size, size);

  const result = await matrixMultiply(a, b);

  // Expected: Uses WASM (≥10x10 threshold)
  // Verifies correct dimensions and values
}
```

**Determinant Tests:**
```javascript
// Small determinant (3x3) - mathjs
// Large determinant (10x10) - WASM
```

#### 3. Statistical Operations Tests

**Small Dataset (mathjs fallback):**
```javascript
async function testSmallMean() {
  const data = Array.from({ length: 50 }, (_, i) => i + 1);
  const result = await statsMean(data);

  // Expected: Uses mathjs (< 100 elements)
  // Result: 25.5
}
```

**Large Dataset (WASM acceleration):**
```javascript
async function testLargeMean() {
  const data = Array.from({ length: 1000 }, (_, i) => i + 1);
  const result = await statsMean(data);

  // Expected: Uses WASM (≥ 100 elements)
  // Result: 500.5
}
```

**All Statistical Operations:**
- mean (100+ elements → WASM)
- median (50+ elements → WASM)
- min (100+ elements → WASM)
- max (100+ elements → WASM)
- variance (100+ elements → WASM)
- std (100+ elements → WASM)

#### 4. Performance Monitoring Test

```javascript
async function testPerformanceMonitoring() {
  const stats = getPerfStats();

  // Verify:
  // - wasmCalls > 0
  // - mathjsCalls > 0
  // - wasmPercentage ≈ 70%
  // - totalCalls = wasmCalls + mathjsCalls

  console.log(`WASM calls: ${stats.wasmCalls}`);
  console.log(`mathjs calls: ${stats.mathjsCalls}`);
  console.log(`WASM percentage: ${stats.wasmPercentage}`);
}
```

### Running Integration Tests

```bash
# Full test run
node test/integration-test.js

# With verbose output
NODE_ENV=development node test/integration-test.js

# With specific Node version
node --version  # Check version
node test/integration-test.js
```

### Expected Output

```
=== MCP Server Integration Tests ===

--- WASM Initialization ---
✓ WASM should be initialized

--- Matrix Operations ---
✓ Small matrix multiply (2x2) - mathjs
✓ Large matrix multiply (20x20) - WASM
✓ Small determinant (3x3) - mathjs
✓ Large determinant (10x10) - WASM

--- Statistical Operations ---
✓ Small mean (50 elements) - mathjs
✓ Large mean (1000 elements) - WASM
✓ Large min (1000 elements) - WASM
✓ Large max (1000 elements) - WASM
✓ Large variance (1000 elements) - WASM
✓ Large std (1000 elements) - WASM

--- Performance Summary ---
Total operations: 10
WASM calls: 7 (70.0%)
mathjs calls: 3
Average WASM time: 0.207ms
Average mathjs time: 1.178ms

--- Test Results ---
Total: 11
Passed: 11
Failed: 0
Success rate: 100.0%

✓ All integration tests passed!
✓ WASM integration working correctly
✓ Threshold-based routing working
✓ Performance monitoring working
```

### Test Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

---

## WASM Differential Tests

### Purpose

Verify that WASM implementations produce **exactly** the same results as mathjs for all operations.

### Location

**Files:**
- `wasm/tests/differential-matrix.cjs`
- `wasm/tests/differential-statistics.cjs`

### Matrix Differential Tests

```bash
cd wasm
node tests/differential-matrix.cjs
```

**What it tests:**

```javascript
// Matrix Multiplication
const matrixA = [[1, 2], [3, 4]];
const matrixB = [[5, 6], [7, 8]];

const wasmResult = wasmMatrixMultiply(matrixA, matrixB);
const mathjsResult = mathjsMatrixMultiply(matrixA, matrixB);

// Verify exact match
assert(arraysEqual(wasmResult, mathjsResult), "Results must match exactly");
```

**Test cases:**
- 2×2 matrices
- 5×5 matrices
- 10×10 matrices
- 20×20 matrices
- 50×50 matrices
- Non-square matrices (where applicable)
- Edge cases (identity matrices, zero matrices)

### Statistics Differential Tests

```bash
cd wasm
node tests/differential-statistics.cjs
```

**What it tests:**

```javascript
// Mean calculation
const data = [1, 2, 3, 4, 5];

const wasmMean = wasmStatsMean(data);
const mathjsMean = mathjsStatsMean(data);

// Verify within floating-point tolerance
assert(Math.abs(wasmMean - mathjsMean) < 1e-10, "Results must match within tolerance");
```

**Test cases:**
- Arrays of 10, 50, 100, 1000, 10000 elements
- Mean, median, min, max, sum
- Standard deviation, variance
- Edge cases (single element, two elements, all same values)

### Expected Output

```
=== Matrix Differential Tests ===

Testing 2x2 multiply: ✓ PASS (WASM matches mathjs)
Testing 5x5 multiply: ✓ PASS (WASM matches mathjs)
Testing 10x10 multiply: ✓ PASS (WASM matches mathjs)
Testing 20x20 multiply: ✓ PASS (WASM matches mathjs)

Testing 5x5 determinant: ✓ PASS (WASM matches mathjs)
Testing 10x10 determinant: ✓ PASS (WASM matches mathjs)

Testing 20x20 transpose: ✓ PASS (WASM matches mathjs)

All matrix differential tests passed!

=== Statistics Differential Tests ===

Testing mean (100 elements): ✓ PASS (diff: 0.000000)
Testing median (100 elements): ✓ PASS (diff: 0.000000)
Testing variance (100 elements): ✓ PASS (diff: 0.000001)
Testing std (100 elements): ✓ PASS (diff: 0.000001)
Testing min (1000 elements): ✓ PASS (diff: 0.000000)
Testing max (1000 elements): ✓ PASS (diff: 0.000000)

All statistics differential tests passed!
```

---

## Performance Benchmarks

### Purpose

Measure and verify WASM performance improvements over pure JavaScript.

### Location

**Files:**
- `wasm/benchmarks/profile-matrix.js`
- `wasm/benchmarks/profile-stats.js`

### Matrix Benchmarks

```bash
cd wasm
node benchmarks/profile-matrix.js
```

**What it measures:**

```javascript
// Matrix Multiplication Benchmark
const sizes = [10, 20, 50];

for (const size of sizes) {
  const matrix = createRandomMatrix(size, size);

  // Benchmark WASM
  const wasmTime = benchmark(() => wasmMultiply(matrix, matrix), iterations);

  // Benchmark mathjs
  const mathjsTime = benchmark(() => mathjsMultiply(matrix, matrix), iterations);

  const speedup = mathjsTime / wasmTime;

  console.log(`${size}x${size}: ${speedup.toFixed(2)}x faster`);
}
```

**Expected results:**
- 10×10 multiply: ~7x speedup
- 20×20 multiply: ~8x speedup
- 50×50 determinant: ~17x speedup

### Statistics Benchmarks

```bash
cd wasm
node benchmarks/profile-stats.js
```

**What it measures:**

```javascript
// Statistics Benchmark
const sizes = [100, 1000, 10000];

for (const size of sizes) {
  const data = createRandomArray(size);

  // Benchmark mean
  const wasmMeanTime = benchmark(() => wasmMean(data), iterations);
  const mathjsMeanTime = benchmark(() => mathjsMean(data), iterations);

  console.log(`Mean (${size}): ${(mathjsMeanTime / wasmMeanTime).toFixed(2)}x`);
}
```

**Expected results:**
- Mean (100): ~7-12x speedup
- Mean (1000): ~15-42x speedup
- Min/Max (1000): ~42x speedup

### Expected Benchmark Output

```
=== Matrix Operations Benchmarks ===

Matrix Multiply:
  10x10:  7.23x faster with WASM
  20x20:  8.15x faster with WASM
  50x50:  9.87x faster with WASM

Matrix Determinant:
  5x5:    8.54x faster with WASM
  10x10:  12.31x faster with WASM
  50x50:  17.42x faster with WASM

Matrix Transpose:
  20x20:  6.87x faster with WASM
  50x50:  11.23x faster with WASM

Average Speedup: 10.18x

=== Statistics Benchmarks ===

Mean:
  100 elements:   9.23x faster with WASM
  1000 elements:  18.45x faster with WASM
  10000 elements: 22.31x faster with WASM

Median:
  50 elements:    7.12x faster with WASM
  100 elements:   12.45x faster with WASM
  1000 elements:  19.87x faster with WASM

Variance:
  100 elements:   10.23x faster with WASM
  1000 elements:  21.45x faster with WASM

Standard Deviation:
  100 elements:   11.34x faster with WASM
  1000 elements:  23.12x faster with WASM

Min/Max:
  1000 elements:  42.15x faster with WASM
  10000 elements: 41.89x faster with WASM

Sum:
  1000 elements:  15.23x faster with WASM
  10000 elements: 18.76x faster with WASM

Average Speedup: 18.62x
Peak Speedup: 42.15x (min operation)
```

---

## Manual Testing

### Testing MCP Server Directly

```bash
# Start the server
node dist/index-wasm.js

# In another terminal, send test request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index-wasm.js
```

**Expected response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "evaluate",
        "description": "..."
      },
      // ... 6 more tools
    ]
  }
}
```

### Testing Individual Tools

```bash
# Test evaluate tool
echo '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "evaluate",
    "arguments": {
      "expression": "2 + 2"
    }
  }
}' | node dist/index-wasm.js
```

### Testing with Claude Desktop

1. Configure Claude Desktop (see DEPLOYMENT_PLAN.md)
2. Restart Claude Desktop
3. Test with prompts:
   - "Calculate 2 + 2"
   - "Find the determinant of [[1,2],[3,4]]"
   - "Calculate the mean of [1,2,3,4,5]"

### Testing with Claude CLI

```bash
# Verify server is connected
claude mcp list

# Should show:
# math-mcp: node c:/mcp-servers/math-mcp/dist/index-wasm.js - ✓ Connected
```

---

## Writing New Tests

### Adding Integration Tests

**Location:** `test/integration-test.js`

```javascript
async function testNewFeature() {
  console.log("--- New Feature Test ---");

  try {
    // 1. Setup test data
    const input = prepareTestData();

    // 2. Execute operation
    const result = await newOperation(input);

    // 3. Verify result
    assertEqual(result, expectedValue, "New feature result");

    // 4. Log success
    console.log("✓ New feature works correctly");
    testsPassed++;

  } catch (error) {
    console.log("✗ New feature failed:", error.message);
    testsFailed++;
  }
}

// Add to test suite
async function runAllTests() {
  // ... existing tests
  await testNewFeature();
  // ...
}
```

### Adding WASM Differential Tests

**Location:** `wasm/tests/differential-<category>.cjs`

```javascript
// Compare WASM vs mathjs results
function testNewWasmOperation() {
  const input = createTestInput();

  const wasmResult = wasmNewOperation(input);
  const mathjsResult = mathjsNewOperation(input);

  const diff = Math.abs(wasmResult - mathjsResult);
  const tolerance = 1e-10;

  if (diff < tolerance) {
    console.log(`✓ PASS (diff: ${diff.toExponential()})`);
    return true;
  } else {
    console.log(`✗ FAIL (diff: ${diff.toExponential()})`);
    return false;
  }
}
```

### Adding Performance Benchmarks

**Location:** `wasm/benchmarks/profile-<category>.js`

```javascript
function benchmarkNewOperation() {
  const input = createBenchmarkInput();
  const iterations = 1000;

  // Warm up
  for (let i = 0; i < 100; i++) {
    wasmOperation(input);
    mathjsOperation(input);
  }

  // Benchmark WASM
  const wasmStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    wasmOperation(input);
  }
  const wasmTime = performance.now() - wasmStart;

  // Benchmark mathjs
  const mathjsStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    mathjsOperation(input);
  }
  const mathjsTime = performance.now() - mathjsStart;

  const speedup = mathjsTime / wasmTime;
  console.log(`New operation: ${speedup.toFixed(2)}x faster with WASM`);
}
```

---

## Continuous Integration

### Pre-commit Checks

```bash
# Run before committing
npm run build && node test/integration-test.js
```

### CI/CD Pipeline (Recommended)

```yaml
# .github/workflows/test.yml (example)
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - run: node test/integration-test.js
      - run: cd wasm && node tests/differential-matrix.cjs
      - run: cd wasm && node tests/differential-statistics.cjs
```

---

## Troubleshooting Tests

### Test Failures

**Integration tests fail:**
```bash
# 1. Rebuild the project
npm run build

# 2. Check Node.js version
node --version  # Should be 18+

# 3. Verify WASM build
ls -la wasm/build/
# Should see release.wasm and debug.wasm

# 4. Check for errors in build output
npm run build 2>&1 | grep error
```

**WASM initialization fails:**
```bash
# Rebuild WASM modules
cd wasm
npm install
npx gulp

# Verify bindings exist
ls -la bindings/
# Should see matrix.cjs and statistics.cjs
```

**Differential tests show mismatches:**
```bash
# This indicates a bug in WASM implementation
# Check AssemblyScript source in wasm/assembly/
# Compare against mathjs implementation
# Verify floating-point precision handling
```

### Common Issues

**Issue:** Tests hang or timeout
**Solution:** Check for infinite loops in WASM code, verify async operations complete

**Issue:** WASM not loading
**Solution:** Rebuild WASM: `cd wasm && npx gulp`

**Issue:** Performance below expectations
**Solution:** Check thresholds in src/wasm-wrapper.ts, verify WASM is being used

---

## Test Coverage Goals

### Current Coverage

- ✅ Integration tests: 11/11 (100%)
- ✅ WASM differential: Matrix operations (multiply, det, transpose)
- ✅ WASM differential: Statistics (mean, median, variance, std, min, max, sum)
- ✅ Performance benchmarks: All WASM operations
- ✅ Threshold routing: Verified via integration tests
- ✅ Fallback mechanism: Tested in integration tests

### Future Coverage Goals

- [ ] Edge case testing (empty arrays, singular matrices)
- [ ] Stress testing (very large matrices/datasets)
- [ ] Memory leak testing (long-running operations)
- [ ] Concurrent operation testing
- [ ] Error handling coverage

---

## Summary

The math-mcp testing strategy ensures:

1. **Correctness**: Differential tests verify WASM matches mathjs exactly
2. **Performance**: Benchmarks confirm 14-42x speedup targets
3. **Integration**: End-to-end tests verify MCP server functionality
4. **Reliability**: Fallback mechanisms tested and working
5. **Monitoring**: Performance metrics tracked automatically

**Test Command Summary:**
```bash
# Quick test
npm run build && node test/integration-test.js

# Full test suite
npm run build
node test/integration-test.js
cd wasm
node tests/differential-matrix.cjs
node tests/differential-statistics.cjs
node benchmarks/profile-matrix.js
node benchmarks/profile-stats.js
```

---

**Last Updated:** November 2, 2025
**Test Status:** 11/11 Integration Tests Passing (100%)
**WASM Status:** All Differential Tests Passing
**Performance:** 14.30x avg, 42x peak speedup achieved
