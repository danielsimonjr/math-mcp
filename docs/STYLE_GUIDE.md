# Math-MCP Style Guide

**Project:** math-mcp
**Version:** 2.0.0-wasm
**Last Updated:** November 2, 2025

This document defines the coding standards and best practices for the math-mcp project, covering TypeScript MCP server code, AssemblyScript WASM implementations, testing, and documentation.

## Table of Contents

1. [Project Naming Conventions](#project-naming-conventions)
2. [TypeScript MCP Server Style](#typescript-mcp-server-style)
3. [AssemblyScript WASM Style](#assemblyscript-wasm-style)
4. [File Organization](#file-organization)
5. [Documentation Standards](#documentation-standards)
6. [Testing Conventions](#testing-conventions)
7. [Git Commit Guidelines](#git-commit-guidelines)
8. [Code Review Checklist](#code-review-checklist)

---

## Project Naming Conventions

### Server Naming

**Official Name:** `math-mcp` (not `mathjs-mcp`)

- **Package name:** `math-mcp` (package.json)
- **MCP server name:** `math-mcp` (in server initialization)
- **Binary name:** `math-mcp` (in package.json bin)
- **Git repository:** Use `math-mcp` in all references

### Rationale
The project was renamed from `mathjs-mcp` to `math-mcp` on November 2, 2025, to:
- Reflect the WASM-accelerated nature beyond just mathjs
- Simplify the name and improve clarity
- Indicate it's a general math server, not just a mathjs wrapper

### File Naming

**TypeScript Files:**
- MCP server files: `index.ts`, `index-wasm.ts`
- Wrapper/utility files: `wasm-wrapper.ts`, `utils.ts`
- Use kebab-case for multi-word files: `performance-monitor.ts`

**AssemblyScript Files:**
- Use kebab-case: `multiply.ts`, `determinant.ts`, `matrix-transpose.ts`

**JavaScript Files:**
- Bindings: `matrix.cjs`, `statistics.cjs` (CommonJS modules)
- Tests: `integration-test.js`, `differential-matrix.cjs`
- Benchmarks: `profile-matrix.js`, `profile-stats.js`

**Documentation:**
- All caps with underscores: `README.md`, `CHANGELOG.md`, `DEPLOYMENT_PLAN.md`
- Exception: `package.json`, `tsconfig.json` (standard names)

---

## TypeScript MCP Server Style

### 1. File Structure

Every TypeScript MCP server file should follow this structure:

```typescript
#!/usr/bin/env node
// Shebang for executable files (index-wasm.ts)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as math from "mathjs";
import * as wasmWrapper from "./wasm-wrapper.js";

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS: Tool[] = [
  {
    name: "evaluate",
    description: "...",
    inputSchema: { /* ... */ },
  },
  // ...
];

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

const server = new Server(
  {
    name: "math-mcp",  // Use official server name
    version: "2.0.0-wasm",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Handle tool calls
});

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Math MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
```

### 2. Naming Conventions

**Variables:**
```typescript
// Use camelCase for variables
const wasmInitialized: boolean = true;
let performanceStats: PerfStats;

// Use descriptive names
const thresholdMatrixMultiply = 10;  // Good
const mmThresh = 10;                 // Bad
```

**Functions:**
```typescript
// Use camelCase verbs
async function evaluateExpression(expr: string): Promise<number> { }
function formatResult(value: any): string { }

// Private functions (in modules): prefix with underscore
function _initializeWASM(): void { }
```

**Constants:**
```typescript
// SCREAMING_SNAKE_CASE for true constants
const MAX_ARRAY_SIZE = 1000000;
const ERROR_MESSAGES = {
  INVALID_INPUT: "Invalid input provided",
  DIMENSION_MISMATCH: "Matrix dimensions do not match",
};

// Object of thresholds: camelCase keys
const THRESHOLDS = {
  matrix_multiply: 10,
  matrix_det: 5,
  statistics: 100,
};
```

**Interfaces and Types:**
```typescript
// PascalCase for types and interfaces
interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

type PerfStats = {
  wasmCalls: number;
  mathjsCalls: number;
  wasmPercentage: string;
};
```

### 3. Type Safety

**Always use explicit types:**

```typescript
// ✅ GOOD: Explicit types
async function multiply(a: number[][], b: number[][]): Promise<number[][]> {
  return wasmWrapper.matrixMultiply(a, b);
}

const result: string = JSON.stringify({ value: 42 });

// ❌ BAD: Implicit any types
async function multiply(a, b) {
  return wasmWrapper.matrixMultiply(a, b);
}
```

**Use type guards:**

```typescript
// Type narrowing
function isMatrix(value: any): value is number[][] {
  return Array.isArray(value) &&
         value.length > 0 &&
         Array.isArray(value[0]);
}

// Usage
if (isMatrix(input)) {
  // TypeScript knows input is number[][]
  const result = multiply(input, input);
}
```

### 4. Error Handling

**MCP Server Error Handling:**

```typescript
// Always return proper MCP responses
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "evaluate": {
        const { expression } = args as { expression: string };
        const result = math.evaluate(expression);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ result: math.format(result) }, null, 2),
            },
          ],
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});
```

### 5. Async/Await Best Practices

```typescript
// ✅ GOOD: Proper async/await usage
async function processRequest(data: string): Promise<Result> {
  try {
    const parsed = JSON.parse(data);
    const result = await wasmWrapper.calculate(parsed);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ❌ BAD: Missing await or improper error handling
async function processRequest(data: string): Promise<Result> {
  const parsed = JSON.parse(data);  // No try-catch
  const result = wasmWrapper.calculate(parsed);  // Missing await
  return { success: true, data: result };
}
```

### 6. Import Conventions

```typescript
// Group imports: SDK, external libraries, local modules
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import * as math from "mathjs";

import * as wasmWrapper from "./wasm-wrapper.js";
import { formatResult } from "./utils.js";

// Use .js extensions for ESM imports (required)
import { helper } from "./helper.js";  // ✅ GOOD
import { helper } from "./helper";      // ❌ BAD
```

### 7. Function Documentation

```typescript
/**
 * Evaluates a mathematical expression with optional variable scope.
 *
 * @param expression - The mathematical expression to evaluate
 * @param scope - Optional object containing variable values
 * @returns The evaluated result, formatted as a string
 *
 * @example
 * const result = await evaluateExpression("2 + 2");
 * // Returns: "4"
 *
 * const result2 = await evaluateExpression("x + y", { x: 5, y: 3 });
 * // Returns: "8"
 */
async function evaluateExpression(
  expression: string,
  scope: object = {}
): Promise<string> {
  const result = math.evaluate(expression, scope);
  return math.format(result);
}
```

---

## AssemblyScript WASM Style

### 1. File Structure

Every AssemblyScript file should follow this structure:

```typescript
/**
 * @file multiply.ts
 * @description Matrix multiplication implementation for WASM
 * @module wasm/assembly/matrix
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { f64, i32 } from 'assemblyscript';

// ============================================================================
// CONSTANTS
// ============================================================================

const EPSILON: f64 = 1e-10;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateDimensions(rows: i32, cols: i32): bool {
  return rows > 0 && cols > 0;
}

// ============================================================================
// EXPORTED FUNCTIONS
// ============================================================================

/**
 * Multiplies two matrices.
 * @param a - First matrix (flattened array)
 * @param aRows - Number of rows in matrix a
 * @param aCols - Number of columns in matrix a
 * @param b - Second matrix (flattened array)
 * @param bRows - Number of rows in matrix b
 * @param bCols - Number of columns in matrix b
 * @returns Resulting matrix (flattened array)
 */
export function multiply(
  a: Float64Array,
  aRows: i32,
  aCols: i32,
  b: Float64Array,
  bRows: i32,
  bCols: i32
): Float64Array {
  // Validate dimensions
  assert(aCols == bRows, "Matrix dimensions incompatible for multiplication");

  const result = new Float64Array(aRows * bCols);

  for (let i: i32 = 0; i < aRows; i++) {
    for (let j: i32 = 0; j < bCols; j++) {
      let sum: f64 = 0.0;
      for (let k: i32 = 0; k < aCols; k++) {
        sum += unchecked(a[i * aCols + k]) * unchecked(b[k * bCols + j]);
      }
      unchecked(result[i * bCols + j] = sum);
    }
  }

  return result;
}
```

### 2. Type Usage

**Use explicit numeric types:**

```typescript
// Integers - use i32 for standard integers
let index: i32 = 0;
let count: i32 = 100;
let size: i32 = 1000;

// Floating point - use f64 for all math operations
let value: f64 = 3.14159;
let result: f64 = 0.0;

// Arrays
let data: Float64Array = new Float64Array(100);
let indices: Int32Array = new Int32Array(10);
```

### 3. Performance Optimizations

```typescript
// ✅ GOOD: Use unchecked for performance in hot loops
function sumArray(arr: Float64Array): f64 {
  let sum: f64 = 0.0;
  const len = arr.length;
  for (let i: i32 = 0; i < len; i++) {
    sum += unchecked(arr[i]);  // Skip bounds checking
  }
  return sum;
}

// ✅ GOOD: Pre-calculate loop bounds
function processMatrix(matrix: Float64Array, rows: i32, cols: i32): void {
  const size = rows * cols;  // Calculate once
  for (let i: i32 = 0; i < size; i++) {
    // Process element
  }
}

// ❌ BAD: Recalculating on each iteration
function sumArraySlow(arr: Float64Array): f64 {
  let sum: f64 = 0.0;
  for (let i: i32 = 0; i < arr.length; i++) {  // Recalculates length
    sum += arr[i];  // Bounds checking on each access
  }
  return sum;
}
```

### 4. Memory Management

```typescript
// AssemblyScript manages memory automatically for most cases
export function createArray(size: i32): Float64Array {
  return new Float64Array(size);  // Garbage collected
}

// For manual memory management (advanced cases only)
// Use sparingly and ensure proper cleanup
```

---

## File Organization

### Project Structure

```
math-mcp/
├── src/                          # TypeScript source code
│   ├── index.ts                  # MathJS-only server (legacy)
│   ├── index-wasm.ts             # WASM-accelerated server (PRODUCTION)
│   └── wasm-wrapper.ts           # WASM integration layer
│
├── dist/                         # Compiled JavaScript output
│   ├── index.js
│   ├── index-wasm.js             # Production entry point
│   └── wasm-wrapper.js
│
├── wasm/                         # WASM implementation
│   ├── assembly/                 # AssemblyScript source
│   │   ├── matrix/               # Matrix operations
│   │   │   ├── multiply.ts
│   │   │   ├── determinant.ts
│   │   │   └── transpose.ts
│   │   └── statistics/           # Statistical operations
│   │       ├── mean.ts
│   │       ├── median.ts
│   │       └── variance.ts
│   ├── bindings/                 # JavaScript <-> WASM bridge
│   │   ├── matrix.cjs
│   │   └── statistics.cjs
│   ├── build/                    # Compiled WASM modules
│   │   ├── release.wasm
│   │   └── debug.wasm
│   ├── tests/                    # Differential tests
│   └── benchmarks/               # Performance benchmarks
│
├── test/                         # Integration tests
│   └── integration-test.js
│
├── docs/                         # Documentation
│   ├── DEPLOYMENT_PLAN.md
│   ├── PRODUCT_SPECIFICATION.md
│   ├── STYLE_GUIDE.md
│   └── ...
│
├── CHANGELOG.md                  # Project history
├── README.md                     # Main documentation
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
```

### File Placement Rules

**Source Files:**
- TypeScript MCP server code → `src/`
- AssemblyScript WASM code → `wasm/assembly/`
- Compiled output → `dist/` (TypeScript), `wasm/build/` (WASM)

**Tests:**
- Integration tests → `test/`
- WASM differential tests → `wasm/tests/`
- Benchmarks → `wasm/benchmarks/`

**Documentation:**
- Major docs → `docs/`
- Project root docs → `CHANGELOG.md`, `README.md`

---

## Documentation Standards

### 1. README.md Structure

```markdown
# Project Name

Brief description (1-2 sentences).

## Features

- Bullet list of key features

## Installation

Step-by-step installation instructions

## Usage

Quick start examples

## Configuration

Configuration options

## Testing

How to run tests

## License

License information
```

### 2. Code Comments

**TypeScript:**

```typescript
// Single-line comments for brief explanations
const threshold = 10;  // Use WASM for matrices >= 10x10

/**
 * Multi-line JSDoc comments for functions, classes, and complex logic.
 * Include @param, @returns, @example tags.
 */
```

**AssemblyScript:**

```typescript
/**
 * Function documentation with JSDoc tags.
 *
 * @param a - Description
 * @returns Description
 */
export function multiply(a: Matrix, b: Matrix): Matrix {
  // Implementation comments when logic is complex
  // ...
}
```

### 3. CHANGELOG.md Format

```markdown
## Version X.Y.Z - Date

**Status:** Complete/In Progress

### Summary
Brief overview of changes

### Changes Made
- Bullet list of specific changes
- Include file:line references where applicable

### Verification
- Test results
- Build status

---
```

### 4. Inline Documentation

```typescript
// ✅ GOOD: Explain WHY, not WHAT
// Use WASM for large matrices because it's 14x faster
if (size >= THRESHOLDS.matrix_multiply) {
  return wasmMultiply(a, b);
}

// ❌ BAD: Redundant comments
// Check if size is greater than or equal to threshold
if (size >= THRESHOLDS.matrix_multiply) {
  return wasmMultiply(a, b);
}
```

---

## Testing Conventions

### 1. Integration Test Structure

```javascript
// test/integration-test.js

console.log("\n=== MCP Server Integration Tests ===\n");

let testsPassed = 0;
let testsFailed = 0;

async function testWasmInitialization() {
  console.log("--- WASM Initialization ---");

  try {
    const initialized = await checkWasmStatus();
    if (initialized) {
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

// Run all tests
async function runAllTests() {
  await testWasmInitialization();
  await testMatrixOperations();
  await testStatistics();

  console.log(`\n--- Test Results ---`);
  console.log(`Total: ${testsPassed + testsFailed}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

runAllTests();
```

### 2. Test Naming

```javascript
// Test function names: testFeatureName
async function testSmallMatrixMultiply() { }
async function testLargeMatrixMultiply() { }
async function testWasmFallback() { }

// Test descriptions: Clear and specific
console.log("✓ Small matrix multiply (2x2) - mathjs");
console.log("✓ Large matrix multiply (20x20) - WASM");
```

### 3. Assertions

```javascript
// Use descriptive assertion messages
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

// Usage
assertEqual(result.length, 4, "Result array length");
assertEqual(wasmPercentage, "70.0%", "WASM usage percentage");
```

---

## Git Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or changes
- `build`: Build system changes
- `chore`: Maintenance tasks

### Examples

```
feat(wasm): add matrix transpose acceleration

Implement WASM-accelerated matrix transpose for matrices >= 20x20.
Achieves 12x speedup compared to mathjs implementation.

- Add transpose.ts to wasm/assembly/matrix/
- Update wasm-wrapper.ts with threshold routing
- Add integration tests

Closes #123
```

```
fix(server): correct server name from mathjs-mcp to math-mcp

Update server name in index.ts and index-wasm.ts to use the
official "math-mcp" name instead of the old "mathjs-mcp" name.

Affected files:
- src/index.ts:153
- src/index-wasm.ts:153
- package.json:2
```

```
docs: merge MCP integration guide into deployment plan

Consolidate MCP_INTEGRATION_GUIDE.md into DEPLOYMENT_PLAN.md
and update with current configuration for both Claude Desktop
and Claude CLI.

- Delete docs/MCP_INTEGRATION_GUIDE.md
- Update docs/DEPLOYMENT_PLAN.md with merged content
```

### Commit Best Practices

1. **Atomic commits**: One logical change per commit
2. **Descriptive subjects**: Clear, imperative mood ("Add feature" not "Added feature")
3. **Body when needed**: Explain WHY, not WHAT (code shows what)
4. **Reference issues**: Use "Closes #123", "Fixes #456"
5. **Keep subject < 72 characters**

---

## Code Review Checklist

### Before Submitting

- [ ] Code follows style guide conventions
- [ ] All tests pass (npm run build && node test/integration-test.js)
- [ ] New features have tests
- [ ] Documentation updated (README, CHANGELOG, etc.)
- [ ] No console.log() in production code (use console.error() for logging)
- [ ] Type safety: No any types unless absolutely necessary
- [ ] Error handling: All async functions have try-catch or error handling
- [ ] Comments: Complex logic is explained

### TypeScript Specific

- [ ] Import statements include .js extensions (ESM requirement)
- [ ] Proper use of async/await
- [ ] MCP responses formatted correctly
- [ ] Server name is "math-mcp" (not "mathjs-mcp")

### WASM Specific

- [ ] Explicit types for all variables and parameters
- [ ] Use unchecked() in performance-critical loops
- [ ] Assertions for input validation
- [ ] Memory management is correct (if using manual allocation)

### Performance

- [ ] WASM thresholds appropriate for operation
- [ ] No unnecessary computations in hot loops
- [ ] Fallback to mathjs if WASM fails

---

## Summary

This style guide establishes conventions for:

1. **Naming**: math-mcp (official name), camelCase variables, PascalCase types
2. **TypeScript**: Explicit types, proper async/await, ESM imports with .js
3. **AssemblyScript**: Explicit numeric types, unchecked for performance
4. **Organization**: Clear project structure, logical file placement
5. **Documentation**: JSDoc comments, clear README/CHANGELOG
6. **Testing**: Descriptive names, clear assertions, integration tests
7. **Git**: Conventional commits, atomic changes, descriptive messages

Following these conventions ensures code quality, maintainability, and consistency across the math-mcp project.

---

**Last Updated:** November 2, 2025
**Version:** 2.0.0-wasm
**Project:** math-mcp
