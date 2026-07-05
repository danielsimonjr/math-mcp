# Math-MCP Style Guide

**Project:** math-mcp

This document defines the coding standards and best practices for the math-mcp project, covering TypeScript MCP server code, testing, and documentation.

## Table of Contents

1. [Project Naming Conventions](#project-naming-conventions)
2. [TypeScript MCP Server Style](#typescript-mcp-server-style)
3. [File Organization](#file-organization)
4. [Documentation Standards](#documentation-standards)
5. [Testing Conventions](#testing-conventions)
6. [Git Commit Guidelines](#git-commit-guidelines)
7. [Code Review Checklist](#code-review-checklist)

---

## Project Naming Conventions

### Server Naming

**Official Name:** `math-mcp` (not `mathjs-mcp`)

- **Package name:** `math-mcp` (package.json)
- **MCP server name:** `math-mcp` (in server initialization)
- **Binary name:** `math-mcp` (in package.json bin)
- **Git repository:** Use `math-mcp` in all references

### Rationale
The project was renamed from `mathjs-mcp` to `math-mcp` to:
- Reflect that the compute engine is not just a thin mathjs wrapper
- Simplify the name and improve clarity
- Indicate it's a general math server

### File Naming

**TypeScript Files:**
- MCP server files: `index.ts`
- Utility files: `utils.ts`, `handler-utils.ts`
- Use kebab-case for multi-word files: `expression-cache.ts`, `rate-limiter.ts`

**JavaScript Files:**
- Tests: `integration-test.js`, `correctness-tests.js`

**Documentation:**
- All caps with underscores: `README.md`, `CHANGELOG.md`
- Exception: `package.json`, `tsconfig.json` (standard names)

---

## TypeScript MCP Server Style

### 1. File Structure

Every TypeScript MCP server file should follow this structure:

```typescript
#!/usr/bin/env node
// Shebang for executable files (index.ts)

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { handleEvaluate, withErrorHandling } from "./tool-handlers.js";
import { getPackageVersion } from "./utils.js";

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
    version: getPackageVersion(),
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

async function main(): Promise<void> {
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
const cacheInitialized: boolean = true;
let performanceStats: PerfStats;

// Use descriptive names
const maxMatrixSize = 1000;  // Good
const mmSize = 1000;         // Bad
```

**Functions:**
```typescript
// Use camelCase verbs
async function evaluateExpression(expr: string): Promise<number> { }
function formatResult(value: any): string { }

// Private functions (in modules): prefix with underscore
function _initializeCache(): void { }
```

**Constants:**
```typescript
// SCREAMING_SNAKE_CASE for true constants
const MAX_ARRAY_SIZE = 1000000;
const ERROR_MESSAGES = {
  INVALID_INPUT: "Invalid input provided",
  DIMENSION_MISMATCH: "Matrix dimensions do not match",
};

// Object of size limits: camelCase keys
const SIZE_LIMITS = {
  matrix_dimension: 1000,
  array_length: 100000,
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
  toolName: string;
  durationMs: number;
  cacheHit: boolean;
};
```

### 3. Type Safety

**Always use explicit types:**

```typescript
// ✅ GOOD: Explicit types
async function multiply(a: number[][], b: number[][]): Promise<number[][]> {
  return math.multiply(a, b);
}

const result: string = JSON.stringify({ value: 42 });

// ❌ BAD: Implicit any types
async function multiply(a, b) {
  return math.multiply(a, b);
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
    const result = await handleEvaluate(parsed);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ❌ BAD: Missing await or improper error handling
async function processRequest(data: string): Promise<Result> {
  const parsed = JSON.parse(data);  // No try-catch
  const result = handleEvaluate(parsed);  // Missing await
  return { success: true, data: result };
}
```

### 6. Import Conventions

```typescript
// Group imports: SDK, external libraries, local modules
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import math from "./math-engine.js";
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

## File Organization

### Project Structure

```
math-mcp/
├── src/                          # TypeScript source code
│   ├── index.ts                  # Entry point: MCP server + 7 tool defs (→ dist/index.js, also bin)
│   ├── math-engine.ts            # Builds the MathTS instance (create(all)); every module imports its default export
│   ├── tool-handlers.ts          # Business logic for the 7 mathematical tools
│   ├── handler-utils.ts          # Shared helpers for the handlers
│   ├── utils.ts                  # Shared helpers (logging, perf tracking, version)
│   ├── validation.ts             # Input validation and security (expression sandboxing, size limits)
│   ├── rate-limiter.ts           # Token bucket rate limiting
│   ├── expression-cache.ts       # Cache for parsed/evaluated expressions
│   ├── health.ts                 # Health check system (Kubernetes-compatible probes)
│   ├── errors.ts                 # Error types
│   ├── types.ts                  # Shared TypeScript types
│   ├── shared/                   # constants.ts, logger.ts (LOG_LEVEL-driven)
│   └── telemetry/                # metrics.ts (Prometheus), server.ts (port 9090: /metrics, /health)
│
├── dist/                         # Compiled JavaScript output
│   └── index.js                  # The only entry point
│
├── test/                         # Tests
│   ├── integration-test.js       # End-to-end integration tests
│   ├── correctness-tests.js      # Mathematical correctness validation
│   ├── unit/                     # Unit tests (Vitest)
│   └── security/                 # Security tests (injection, DoS, fuzzing, bounds)
│
├── docs/                         # Documentation
│   ├── PRODUCT_SPECIFICATION.md
│   ├── STYLE_GUIDE.md
│   └── ...
│
├── eslint.config.js              # ESLint flat config
├── CHANGELOG.md                  # Project history
├── README.md                     # Main documentation
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
```

### File Placement Rules

**Source Files:**
- TypeScript MCP server code → `src/`
- Compiled output → `dist/`

**Tests:**
- Integration/correctness tests → `test/`
- Unit tests → `test/unit/`
- Security tests → `test/security/`

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
const MAX_MATRIX_SIZE = 1000;  // Reject matrices larger than this (src/validation.ts)

/**
 * Multi-line JSDoc comments for functions, classes, and complex logic.
 * Include @param, @returns, @example tags.
 */
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
// Reject oversized matrices up front since synchronous JS can't be interrupted mid-computation
if (size > MAX_MATRIX_SIZE) {
  throw new ValidationError("Matrix exceeds maximum allowed size");
}

// ❌ BAD: Redundant comments
// Check if size is greater than max matrix size
if (size > MAX_MATRIX_SIZE) {
  throw new ValidationError("Matrix exceeds maximum allowed size");
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

async function testEvaluateTool() {
  console.log("--- evaluate tool ---");

  try {
    const result = await callTool("evaluate", { expression: "2 + 2" });
    if (result === "4") {
      console.log("✓ evaluate returns correct result");
      testsPassed++;
    } else {
      throw new Error(`Expected 4, got ${result}`);
    }
  } catch (error) {
    console.log("✗ evaluate failed:", error.message);
    testsFailed++;
  }
}

// Run all tests
async function runAllTests() {
  await testEvaluateTool();
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
async function testMatrixSizeLimitRejected() { }

// Test descriptions: Clear and specific
console.log("✓ Small matrix multiply (2x2)");
console.log("✓ Large matrix rejected (exceeds MAX_MATRIX_SIZE)");
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
assertEqual(response.isError, false, "Tool call should not error");
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
feat(solve): add exact polynomial roots for degree <= 3

Delegate degree-<=3 closed-form solving to MathTS's polynomialRoot,
including complex roots, with a numeric real-root fallback for
higher-degree/transcendental equations.

- Update handleSolve in tool-handlers.ts
- Add unit tests in test/unit/solver.test.ts

Closes #123
```

```
fix(server): correct server name from mathjs-mcp to math-mcp

Update server name in index.ts to use the official "math-mcp"
name instead of the old "mathjs-mcp" name.

Affected files:
- src/index.ts:153
- package.json:2
```

```
docs: update style guide for the v4 MathTS architecture

Remove stale conventions from the deleted WASM acceleration stack and replace them
with the current src/ layout and MathTS-based engine references.

- Update docs/STYLE_GUIDE.md
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
- [ ] All tests pass (`npm run build && npm test`)
- [ ] New features have tests
- [ ] Documentation updated (README, CHANGELOG, etc.)
- [ ] No console.log() in production code (use console.error() for logging)
- [ ] Type safety: No `any` types unless absolutely necessary (lint will warn)
- [ ] Error handling: All async functions have try-catch or error handling
- [ ] Comments: Complex logic is explained

### TypeScript Specific

- [ ] Import statements include .js extensions (ESM requirement)
- [ ] Compute engine accessed via `src/math-engine.ts` (MathTS, mathjs-compatible API — not called "mathjs")
- [ ] Proper use of async/await
- [ ] MCP responses formatted correctly
- [ ] Server name is "math-mcp" (not "mathjs-mcp")
- [ ] Shared types imported from `src/types.ts`

### Performance

- [ ] No unnecessary computations in hot loops
- [ ] Large-input protection enforced via size limits (`src/validation.ts`), not timeouts

---

## Summary

This style guide establishes conventions for:

1. **Naming**: math-mcp (official name), camelCase variables, PascalCase types
2. **TypeScript**: Explicit types, proper async/await, ESM imports with .js
3. **Organization**: Clear project structure, logical file placement
4. **Documentation**: JSDoc comments, clear README/CHANGELOG
5. **Testing**: Descriptive names, clear assertions, integration tests
6. **Git**: Conventional commits, atomic changes, descriptive messages

Following these conventions ensures code quality, maintainability, and consistency across the math-mcp project.

---

**Project:** math-mcp
