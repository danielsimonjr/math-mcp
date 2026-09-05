# Math-MCP Build Guide

**Project:** math-mcp
**Version:** 4.1.3

This guide covers the build process for the math-mcp project: TypeScript
compilation and distribution preparation.

## Table of Contents

1. [Build Overview](#build-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [TypeScript Build](#typescript-build)
5. [Build Scripts](#build-scripts)
6. [Build Verification](#build-verification)
7. [Build Optimization](#build-optimization)
8. [Distribution](#distribution)
9. [Troubleshooting](#troubleshooting)

---

## Build Overview

### Build Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  Source Files                                                │
├─────────────────────────────────────────────────────────────┤
│  TypeScript (src/)                                           │
│  ├── index.ts                                                │
│  ├── math-engine.ts                                          │
│  ├── tool-handlers.ts                                        │
│  └── ...                                                     │
└──────────────┬────────────────────────────────────────────────┘
               │
               ▼
      ┌────────────────┐
      │ TypeScript     │
      │ Compiler (tsc) │
      └────────┬───────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Build Output                                                │
├─────────────────────────────────────────────────────────────┤
│  JavaScript (dist/)                                          │
│  ├── index.js         # Production MCP server (bin entry)   │
│  ├── math-engine.js                                          │
│  ├── tool-handlers.js                                        │
│  └── ...                                                     │
└─────────────────────────────────────────────────────────────┘
```

The compute engine itself is **MathTS** (`@danielsimonjr/mathts-compat` +
`@danielsimonjr/mathts-matrix`), a mathjs-compatible API consumed as an npm
dependency — it is not compiled as part of this project's build.

### Build Outputs

**Primary Output:**
- `dist/index.js` - Production MCP server (also the `bin` entry, `math-mcp`)

`tsc` also emits a `.js`, `.d.ts`, and `.js.map` file for every module under
`src/` (e.g. `dist/math-engine.js`, `dist/tool-handlers.js`, etc.).

---

## Prerequisites

### Required Software

**Node.js:**
```bash
# Check version
node --version
# Required: v22.0.0 or higher (shipped runtime)
```

**Bun:**
```bash
# Check version
bun --version
```

**TypeScript:**
```bash
# Installed as a dev dependency; available after bun install
bunx tsc --version
```

### Installation

```bash
bun install
```

### Verify Installation

```bash
bunx tsc --version
```

---

## Quick Start

### Standard Build

```bash
# From project root
bun run build
```

This runs `tsc`, compiling `src/*.ts` → `dist/*.js` per `tsconfig.json`. This
is the **only** build step — there is no separate native/WASM build.

### Development Build

```bash
bun run dev
```

This runs `tsc && node dist/index.js` — compile, then start the server.

---

## TypeScript Build

### Build Configuration

**File:** `tsconfig.json` — see the file for current compiler options
(target, module, outDir, strict mode, etc.).

### Build Process

```bash
# Standard TypeScript compilation
bun run build
```

**What happens:**
1. TypeScript compiler reads `tsconfig.json`
2. Compiles all `.ts` files in `src/`
3. Outputs `.js` files to `dist/`
4. Generates `.d.ts` type definition files and `.js.map` source maps

### Watch Mode (Development)

```bash
# Auto-recompile on file changes
bunx tsc --watch
```

### Clean Build

```bash
rm -rf dist/
bun run build
```

---

## Build Scripts

### package.json Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js"
  }
}
```

### Usage

**Build:**
```bash
bun run build
```

**Start production server:**
```bash
bun start
# Runs: node dist/index.js
```

**Development mode:**
```bash
bun run dev
# 1. Compiles TypeScript
# 2. Starts the server
```

### Test Scripts

```bash
bun run test               # Integration tests (test/integration-test.js)
bun run test:correctness  # Mathematical correctness tests
bun run test:unit         # Vitest unit tests
bun run test:security     # Vitest security tests (test/security/)
bun run test:coverage     # Vitest with coverage
bun run test:all          # test + test:correctness
```

### Code Quality Scripts

```bash
bun run type-check    # tsc --noEmit
bun run lint           # eslint on src/ and test/
bun run lint:fix       # eslint --fix
bun run format         # prettier --write
bun run format:check   # prettier --check
```

---

## Build Verification

### Verify TypeScript Build

```bash
# Check dist/ directory exists and index.js is present
bun run verify:dist
```

This runs the `verify:dist` script, which checks that `dist/` exists and
`dist/index.js` was produced.

**Test compiled output:**
```bash
node dist/index.js
# Should wait for JSON-RPC input on stdin (Ctrl+C to exit)
```

### Full Build Verification

```bash
bun run build && bun run test

# Expected:
# - TypeScript builds with 0 errors
# - Integration tests pass (12 tests)
```

---

## Build Optimization

TypeScript compiler options that affect build output size/speed (e.g.
`sourceMap`, `declaration`, `incremental`) are controlled entirely in
`tsconfig.json`. There is no separate optimization pass — `bun run build`
is a single `tsc` invocation.

**Incremental builds:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "incremental": true,
    "tsBuildInfoFile": ".tsbuildinfo"
  }
}
```

---

## Distribution

### Preparing for Distribution

```bash
# 1. Clean build
rm -rf dist/ node_modules/

# 2. Fresh install
bun install

# 3. Build
bun run build

# 4. Verify
bun run verify:dist
bun run test

# 5. Test startup
node dist/index.js
```

### Distribution Package

**Files to include:**
```
math-mcp/
├── dist/                    # Include (compiled output)
├── package.json             # Include
├── README.md                # Include
├── CHANGELOG.md             # Include
├── LICENSE                  # Include
├── src/                     # Exclude (source code)
├── node_modules/            # Exclude (reinstall)
├── test/                    # Exclude (optional)
└── docs/                    # Exclude (optional)
```

### npm Package

```bash
npm pack
```

### Global Installation

```bash
# Link globally for development
npm link

# Or install globally from a tarball
bun add -g <tarball>
```

---

## Troubleshooting

### TypeScript Build Issues

**Issue:** `Cannot find module '@modelcontextprotocol/sdk'`
```bash
bun install
```

**Issue:** TypeScript compilation errors
```bash
bunx tsc --version

# Clean build
rm -rf dist/ .tsbuildinfo
bun run build
```

**Issue:** Module resolution errors
```bash
# Verify imports use .js extensions
# GOOD: import { x } from "./module.js";
# BAD:  import { x } from "./module";
```

### Common Build Problems

**Issue:** Tests fail after build
```bash
bun run build
bun run test
```

### Build Environment Issues

**Issue:** Different behavior on Windows vs Linux
```bash
git config core.autocrlf true  # Windows
git config core.autocrlf input # Linux/Mac

bun run build
```

**Issue:** Permission errors (Linux/Mac)
```bash
chmod +x dist/index.js
```

---

## Build Best Practices

### 1. Always Build Before Testing

```bash
# GOOD
bun run build && bun run test

# BAD
bun run test  # Using a stale build's compiled output is not the concern here,
          # since tests run against source/dist directly — but always
          # rebuild after source changes before testing manually.
```

### 2. Clean Builds for Production

```bash
rm -rf dist/ .tsbuildinfo
bun run build
```

### 3. Verify After Build

```bash
bun run verify:dist
bun run test
```

### 4. Version Control

**Files to commit:**
- `src/` - Source code
- `package.json`, `tsconfig.json` - Config

**Files not committed (gitignored / regenerated):**
- `dist/` - Build output (regenerate with `bun run build`)
- `node_modules/` - Dependencies (reinstall with `bun install`)

---

## Summary

### Build Commands Quick Reference

```bash
# Standard build
bun run build

# Development mode
bun run dev

# Build verification
bun run build && bun run test

# Clean and rebuild
rm -rf dist/ && bun run build

# Distribution package
npm pack
```

### Build Outputs

- **Production server:** `dist/index.js` (main entry point and `bin`)

### Build Success Criteria

- TypeScript compiles with 0 errors
- `dist/index.js` present (`bun run verify:dist`)
- Server starts without errors
- Integration tests pass (`bun run test`)
