# Math-MCP Test Verification Plan

## Overview

This document outlines the comprehensive testing strategy for **math-mcp**, an MCP server for mathematical operations. The compute engine is **MathTS** (`@danielsimonjr/mathts-compat` + `@danielsimonjr/mathts-matrix`), a mathjs-compatible API, built via `create(all)` in `src/math-engine.ts`. MathTS handles its own internal tier dispatch; there is no separate acceleration/fallback layer for the server to route between.

**Architecture**: MCP Server (`src/index.ts`) → `src/tool-handlers.ts` → MathTS engine (`src/math-engine.ts`)

## Testing Principles

1. **Correctness First**: All operations must produce mathematically correct results
2. **Input Safety**: Expression sandboxing, AST validation, and size limits must hold under adversarial input
3. **Integration Testing**: Full MCP tool-handler end-to-end testing
4. **No Regression**: All existing functionality (the 7 tools' I/O contracts) must continue to work
5. **Security Validation**: Injection, DoS, fuzzing, and bounds testing must pass

## Current Test Status

**Server Name**: math-mcp
**Engine**: MathTS (mathjs-compatible)

### Test Results Summary
- **Integration Tests**: 12/12 passing (100%)
- **Unit Tests (Vitest)**: 372 tests passing across 11 test files
- **Security Tests (Vitest)**: 121 tests — 118 passing, 3 intentionally skipped, across 4 test files
- **Correctness Tests**: mathematical results validated against expected values

## Test Categories

### 1. Integration Tests

**Location**: `test/integration-test.js`
**Purpose**: End-to-end testing of the MCP server's tool handlers
**Framework**: Custom lightweight test harness

#### Test Categories

1. **Matrix Operations**
   - Matrix multiply (2×2)
   - Matrix multiply (20×20 shape check)
   - Determinant (3×3)
   - Transpose (array in → array out)

2. **Statistics**
   - Mean
   - Min / max
   - Variance / std (sample default)
   - Large-array mean (1000 elements)

3. **Symbolic Math**
   - Expression evaluation
   - Simplification
   - Derivatives

4. **Unit Conversion**
   - One representative conversion

#### Running Integration Tests

```bash
# Run all integration tests
npm test

# Expected output:
--- Matrix Operations ---
✓ matrix multiply (2x2)
✓ matrix multiply (20x20) shape
✓ determinant (3x3)
✓ transpose (array in → array out)

--- Statistics ---
✓ mean
✓ min / max
✓ variance / std (sample default)
✓ large mean (1000 elements)

--- Symbolic ---
✓ evaluate
✓ simplify
✓ derivative
✓ unit conversion

--- Test Results ---
Total: 12  Passed: 12  Failed: 0

✓ All integration tests passed!
```

#### Success Criteria

- ✅ All 12 tests pass
- ✅ No errors or exceptions
- ✅ Correct results for all operations

### 2. Correctness Tests

**Location**: `test/correctness-tests.js`
**Purpose**: Validate mathematical correctness of results independent of the MCP transport layer
**Run with**: `npm run test:correctness`

### 3. Unit Tests

**Location**: `test/unit/`
**Framework**: Vitest
**Total**: 372 tests passing across 11 test files

#### Unit Test Files

- `handler-utils.test.ts` — response formatting / error-handling helpers used by `tool-handlers.ts`
- `validation.test.ts` — expression sandboxing, AST validation, size limits (`src/validation.ts`)
- `rate-limiter.test.ts` — token-bucket rate limiting (`src/rate-limiter.ts`)
- `expression-cache.test.ts` — LRU expression cache (`src/expression-cache.ts`)
- `errors.test.ts` — error types (`src/errors.ts`)
- `health.test.ts` — health check probes (`src/health.ts`)
- `solver.test.ts` — `solve` tool behavior (exact roots ≤ degree 3 incl. complex, numeric real-root fallback ≥ degree 4 / transcendental)
- `utils.test.ts` — shared utility helpers
- `shared/` — tests for `src/shared/` (constants, `LOG_LEVEL`-driven logger)
- `telemetry/` — tests for `src/telemetry/` (Prometheus metrics, health probes on port 9090)

#### Running Unit Tests

```bash
npm run test:unit
```

### 4. Security Tests

**Location**: `test/security/`
**Framework**: Vitest
**Total**: 121 tests — 118 passing, 3 intentionally skipped, across 4 test files

#### Security Test Files

- `injection.test.ts` — expression injection / sandbox escape attempts
- `dos.test.ts` — denial-of-service protection (oversized expressions, matrices, arrays)
- `fuzzing.test.ts` — fuzzed/malformed input handling
- `bounds.test.ts` — `MAX_MATRIX_SIZE` / `MAX_ARRAY_LENGTH` and related boundary conditions

Because the engine runs synchronously in JavaScript, a runaway computation
cannot be interrupted by a timeout — so DoS protection is enforced entirely
through **size limits and input validation** in `src/validation.ts`. The
security suite exists to verify those limits actually hold under adversarial
input, not to test a fallback/acceleration chain.

#### Running Security Tests

```bash
npm run test:security
```

#### Success Criteria

- ✅ Injection attempts are rejected or safely sandboxed
- ✅ Oversized inputs are rejected via size limits, not left to run unbounded
- ✅ Fuzzed/malformed input produces typed errors, not crashes
- ✅ Boundary conditions at `MAX_MATRIX_SIZE` / `MAX_ARRAY_LENGTH` behave correctly

### 5. Edge Case Testing

**Purpose**: Test boundary conditions and error cases (covered within `test/unit/` and `test/security/`, not a separate suite)

#### Test Cases

- Empty array statistics (should throw)
- Singular matrix inverse (should throw)
- Division by zero (should return Infinity)
- Very large numbers (handle overflow)
- Very small numbers (handle underflow)
- NaN propagation (correct behavior)
- Infinity handling (mathematical correctness)
- Matrix dimension mismatch (clear errors)
- Non-numeric inputs (validation)

## Test Infrastructure

### Directory Structure

```
math-mcp/
├── test/
│   ├── integration-test.js        # Main integration test suite (12 tests)
│   ├── correctness-tests.js       # Mathematical correctness validation
│   ├── unit/                      # Vitest unit tests (372 tests, 11 files)
│   │   ├── handler-utils.test.ts
│   │   ├── validation.test.ts
│   │   ├── rate-limiter.test.ts
│   │   ├── expression-cache.test.ts
│   │   ├── errors.test.ts
│   │   ├── health.test.ts
│   │   ├── solver.test.ts
│   │   ├── utils.test.ts
│   │   ├── shared/
│   │   └── telemetry/
│   └── security/                  # Vitest security tests (121 tests, 4 files)
│       ├── injection.test.ts
│       ├── dos.test.ts
│       ├── fuzzing.test.ts
│       └── bounds.test.ts
└── src/
    ├── index.ts                   # MCP server entry point → dist/index.js (also bin)
    ├── math-engine.ts             # Builds the MathTS instance (create(all))
    ├── tool-handlers.ts           # Business logic for all 7 tools
    ├── validation.ts              # Input validation / expression sandboxing / size limits
    ├── rate-limiter.ts            # Token-bucket rate limiting
    ├── expression-cache.ts        # LRU expression cache
    ├── health.ts                  # Health check probes
    ├── errors.ts / types.ts       # Error types and shared TypeScript types
    ├── shared/                    # constants.ts, logger.ts
    └── telemetry/                 # metrics.ts, server.ts (port 9090)
```

### Test Execution Scripts

**package.json**:
```json
{
  "scripts": {
    "test": "node test/integration-test.js",
    "test:correctness": "node test/correctness-tests.js",
    "test:all": "npm test && npm run test:correctness",
    "test:unit": "vitest",
    "test:coverage": "vitest --coverage",
    "test:security": "vitest run test/security/"
  }
}
```

### Running Tests

```bash
# Run main integration test suite (12 tests)
npm test

# Run correctness tests
npm run test:correctness

# Run unit tests
npm run test:unit

# Run security tests
npm run test:security

# Run coverage
npm run test:coverage

# Run integration + correctness together
npm run test:all
```

## Continuous Integration

### CI/CD Pipeline (Proposed)

```yaml
# .github/workflows/ci.yml
name: Math-MCP CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - name: Install dependencies
        run: npm install
      - name: Build TypeScript
        run: npm run build
      - name: Run unit tests
        run: npm run test:unit
      - name: Run integration tests
        run: npm test
      - name: Run correctness tests
        run: npm run test:correctness
      - name: Run security tests
        run: npm run test:security
```

## Acceptance Criteria

### Critical (Must Pass) ✅

- ✅ **All integration tests pass** (12/12 = 100%)
- ✅ **All unit tests pass** (372/372)
- ✅ **Correctness tests pass** (mathematically validated results)
- ✅ **Security tests pass** (118/118 non-skipped)
- ✅ **MCP server responds correctly** (all 7 tools functional)
- ✅ **No crashes or exceptions** (robust error handling)

### High Priority (Should Pass)

- ✅ **Response time reasonable** for typical operations (small matrices/arrays)
- ⏳ **Multi-platform testing** (macOS, Linux) — see below
- ⏳ **Multiple Node.js versions** (18, 20, 22)

### Medium Priority (Nice to Have)

- ⏳ **CI/CD pipeline** (automated testing)
- ⏳ **Code coverage** tracked via `npm run test:coverage`
- ⏳ **Load testing** (concurrent operations)

## Current Status

### Completed ✅

1. **Integration Test Suite**
   - 12 tests covering matrix operations, statistics, symbolic math, and unit conversion
   - 100% pass rate

2. **MathTS Engine Integration**
   - `@danielsimonjr/mathts-compat` provides the mathjs-compatible API surface
   - Large-input protection via size limits (`MAX_MATRIX_SIZE`, `MAX_ARRAY_LENGTH`) rather than timeouts
   - Known limitation: large dense matrix multiplication is slower than the old WASM path (MathTS's JS matmul); small matrices — the normal tool use — remain fast

3. **MCP Server Integration**
   - 7 tools fully functional (evaluate, simplify, derivative, solve, matrix_operations, statistics, unit_conversion)
   - JSON-RPC 2.0 protocol compliance
   - Proper error handling
   - Works with Claude Desktop and Claude CLI

4. **Unit Test Suite**
   - 372 tests passing across 11 files covering handler utils, validation, rate limiting, expression caching, errors, health, the solver, shared utilities, and telemetry

5. **Security Test Suite**
   - 121 tests (118 passing, 3 intentionally skipped) across injection, DoS, fuzzing, and bounds

### In Progress ⏳

1. **Multi-Platform Testing**
   - Windows: ✅ Tested and working
   - macOS: ⏳ Needs testing
   - Linux: ⏳ Needs testing

2. **CI/CD Pipeline**
   - GitHub Actions workflow proposed above
   - Needs repository setup and activation

### Planned 🔮

1. **Extended Edge Case Testing**
   - Stress testing with very large inputs (within size limits)
   - Concurrency testing

2. **Documentation**
   - Coverage reporting via `npm run test:coverage`

## Test Reporting

### Integration Test Report Format

```
Math-MCP Integration Test Suite
Platform: Windows / macOS / Linux, Node.js 18+

RESULTS:
✓ Matrix Operations (4/4)
✓ Statistics (4/4)
✓ Symbolic Math (3/3)
✓ Unit Conversion (1/1)

SUMMARY:
- Tests Passed: 12/12 (100%)

STATUS: ✅ ALL TESTS PASSED
```

## Troubleshooting Test Failures

### Integration Tests Failing

```bash
# Rebuild the project and confirm the entry point exists
npm run build
ls dist/index.js
```

### Unit / Security Tests Failing

```bash
# Run with verbose output to see which assertion failed
npx vitest run test/unit --reporter=verbose
npx vitest run test/security --reporter=verbose

# Check the actual limits in effect
grep -n "MAX_MATRIX_SIZE\|MAX_ARRAY_LENGTH" src/validation.ts
```

## Conclusion

This test verification plan ensures:

1. **Correctness**: correctness and unit tests guarantee MathTS produces mathematically sound results
2. **Integration**: end-to-end tests verify MCP server functionality across all 7 tools
3. **Security**: injection/DoS/fuzzing/bounds tests verify sandboxing and size limits hold under adversarial input
4. **Reliability**: health checks and telemetry are covered by dedicated unit tests

**Current Status**: Integration, unit, correctness, and security suites all in place and passing (security: 118/118 non-skipped).

**Next Steps**:
1. Expand multi-platform testing (macOS, Linux)
2. Implement the proposed CI/CD pipeline
3. Add stress and concurrency tests
