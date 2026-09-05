# Math-MCP Testing Guide

**Project:** math-mcp
**Engine:** MathTS (mathjs-compatible API)

This guide covers all testing procedures, test types, and quality assurance practices for the math-mcp project.

## Table of Contents

1. [Testing Overview](#testing-overview)
2. [Quick Start](#quick-start)
3. [Integration Tests](#integration-tests)
4. [Unit Tests](#unit-tests)
5. [Security Tests](#security-tests)
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
│  Unit Tests (test/unit/, Vitest)                             │
│  - handler-utils, validation, rate-limiter, expression-cache │
│  - errors, health, solver, utils, shared/, telemetry/        │
│  Status: 372 tests passing (11 test files)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Integration Tests (test/integration-test.js)                │
│  - End-to-end MCP server testing                             │
│  - Matrix, statistics, symbolic math, unit conversion         │
│  Status: 12/12 passing (100%)                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Correctness Tests (test/correctness-tests.js)                │
│  - Mathematical correctness validation                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Security Tests (test/security/, Vitest)                     │
│  - Injection, DoS, fuzzing, and bounds testing                │
│  Status: 121 tests (118 passing, 3 skipped, 4 test files)     │
└─────────────────────────────────────────────────────────────┘
```

### Test Success Criteria

**All tests must meet these criteria:**

- ✅ Unit tests: all passing
- ✅ Integration tests: 12/12 passing (100%)
- ✅ Correctness tests: all mathematical results verified
- ✅ Security tests: injection/DoS/fuzzing/bounds all passing (skips are intentional, not failures)
- ✅ No unexpected regressions in tool I/O for the 7 MCP tools

---

## Quick Start

### Run All Tests

```bash
# 1. Build the project
bun run build

# 2. Run unit tests
bun run test:unit

# 3. Run integration tests
bun run test

# 4. Run correctness tests
bun run test:correctness

# 5. Run security tests
bun run test:security
```

### Run Everything at Once

```bash
bun run test:all
```

---

## Integration Tests

### Location and Structure

**File:** `test/integration-test.js`
**Purpose:** End-to-end testing of the MCP server through the MathTS engine

### Test Categories

The integration suite exercises the real tool handlers directly (no MCP transport mocking):

1. **Matrix Operations** — multiply (2×2), multiply (20×20 shape check), determinant (3×3), transpose
2. **Statistics** — mean, min/max, variance/std (sample default), large-array mean (1000 elements)
3. **Symbolic Math** — evaluate, simplify, derivative
4. **Unit Conversion** — one representative conversion

### Running Integration Tests

```bash
# Full test run
bun run test

# Equivalent direct invocation
node test/integration-test.js
```

### Expected Output

```
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

### Test Exit Codes

- `0` - All tests passed
- `1` - One or more tests failed

---

## Unit Tests

### Location and Structure

**Location:** `test/unit/`
**Framework:** Vitest

### Unit Test Files

- `handler-utils.test.ts` — response formatting / error-handling helpers used by `tool-handlers.ts`
- `validation.test.ts` — expression sandboxing, AST validation, size limits (`src/validation.ts`)
- `rate-limiter.test.ts` — token-bucket rate limiting (`src/rate-limiter.ts`)
- `expression-cache.test.ts` — LRU expression cache (`src/expression-cache.ts`)
- `errors.test.ts` — error types (`src/errors.ts`)
- `health.test.ts` — health check probes (`src/health.ts`)
- `solver.test.ts` — `solve` tool behavior (exact roots ≤ degree 3, numeric fallback ≥ degree 4 / transcendental)
- `utils.test.ts` — shared utility helpers
- `shared/` — tests for `src/shared/` (constants, logger)
- `telemetry/` — tests for `src/telemetry/` (Prometheus metrics, health server on port 9090)

### Running Unit Tests

```bash
# Run once (CI mode)
bun run test:unit

# With coverage
bun run test:coverage
```

---

## Security Tests

### Location and Structure

**Location:** `test/security/`
**Framework:** Vitest

### Security Test Files

- `injection.test.ts` — expression injection / sandbox escape attempts
- `dos.test.ts` — denial-of-service protection (oversized expressions, matrices, arrays)
- `fuzzing.test.ts` — fuzzed/malformed input handling
- `bounds.test.ts` — `MAX_MATRIX_SIZE` / `MAX_ARRAY_LENGTH` and related boundary conditions

### Running Security Tests

```bash
bun run test:security
```

**What it protects against:** since the engine is synchronous JavaScript (no
timeouts can interrupt a running computation), protection against
pathologically large or malicious inputs is enforced entirely through **size
limits and input validation** in `src/validation.ts`, not through a
fallback/acceleration tier. The security suite exists to verify those limits
actually hold.

---

## Manual Testing

### Testing MCP Server Directly

```bash
# Start the server
node dist/index.js

# In another terminal, send test request
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
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
}' | node dist/index.js
```

### Testing with Claude Desktop

1. Configure Claude Desktop to point at `node dist/index.js`
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
# math-mcp: node c:/mcp-servers/math-mcp/dist/index.js - ✓ Connected
```

---

## Writing New Tests

### Adding Unit Tests

**Location:** `test/unit/<module>.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('newFeature', () => {
  it('should produce correct output', () => {
    const result = newFeature(input);
    expect(result).toEqual(expectedValue);
  });
});
```

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

### Adding Security Tests

**Location:** `test/security/<category>.test.ts`

Follow the pattern in `injection.test.ts` / `dos.test.ts` / `fuzzing.test.ts` /
`bounds.test.ts`: exercise a tool handler directly with a malicious or
boundary-condition input and assert either a safe rejection (thrown/typed
error) or a bounded, correct result.

---

## Continuous Integration

### Pre-commit Checks

```bash
# Run before committing
bun run build && bun run test:unit && bun run test && bun run test:security
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
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version: '1.4.0'
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: bun install --frozen-lockfile
      - run: bun run build
      - run: bun run test:unit
      - run: bun run test
      - run: bun run test:correctness
      - run: bun run test:security
```

---

## Troubleshooting Tests

### Test Failures

**Unit tests fail:**
```bash
# 1. Rebuild the project
bun run build

# 2. Check Node.js version
node --version  # Should be 22+

# 3. Run with verbose output
npx vitest run test/unit --reporter=verbose
```

**Integration tests fail:**
```bash
# 1. Rebuild the project
bun run build

# 2. Check Node.js version
node --version  # Should be 22+

# 3. Check for errors in build output
bun run build 2>&1 | grep error

# 4. Confirm the entry point exists
ls -la dist/index.js
```

**Security tests fail or a limit isn't enforced:**
```bash
# Check the actual limits in effect
grep -n "MAX_MATRIX_SIZE\|MAX_ARRAY_LENGTH" src/validation.ts

# Re-run just the security suite with verbose output
npx vitest run test/security --reporter=verbose
```

### Common Issues

**Issue:** Tests hang or timeout
**Solution:** Check for infinite loops / unbounded recursion in the expression being evaluated; verify async operations complete.

**Issue:** `dist/index.js` missing
**Solution:** Run `bun run build` (tsc) first — there is no other build step.

---

## Test Coverage Goals

### Current Coverage

- ✅ Unit tests: 372 tests passing (11 test files)
- ✅ Integration tests: 12/12 (100%)
- ✅ Correctness tests: mathematical results validated
- ✅ Security tests: 121 tests, 118 passing / 3 intentionally skipped (4 test files)

### Future Coverage Goals

- [ ] Edge case testing (empty arrays, singular matrices)
- [ ] Stress testing (very large matrices/datasets, within size limits)
- [ ] Concurrent operation testing
- [ ] Expanded correctness coverage for `solve` at higher polynomial degrees

---

## Summary

The math-mcp testing strategy ensures:

1. **Correctness**: correctness tests and unit tests verify MathTS results are mathematically sound
2. **Integration**: end-to-end tests verify MCP server functionality across all 7 tools
3. **Security**: injection/DoS/fuzzing/bounds tests verify input validation and size limits hold
4. **Reliability**: health checks and telemetry are covered by dedicated unit tests

**Test Command Summary:**
```bash
# Quick test
bun run build && bun run test:unit && bun run test

# Full test suite
bun run build
bun run test:unit
bun run test
bun run test:correctness
bun run test:security
bun run test:coverage
```
