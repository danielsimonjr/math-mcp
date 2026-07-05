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
# Required: v18.0.0 or higher
```

**npm:**
```bash
# Check version
npm --version
```

**TypeScript:**
```bash
# Installed as a dev dependency; available after npm install
npx tsc --version
```

### Installation

```bash
npm install
```

### Verify Installation

```bash
npx tsc --version
```

---

## Quick Start

### Standard Build

```bash
# From project root
npm run build
```

This runs `tsc`, compiling `src/*.ts` → `dist/*.js` per `tsconfig.json`. This
is the **only** build step — there is no separate native/WASM build.

### Development Build

```bash
npm run dev
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
npm run build
```

**What happens:**
1. TypeScript compiler reads `tsconfig.json`
2. Compiles all `.ts` files in `src/`
3. Outputs `.js` files to `dist/`
4. Generates `.d.ts` type definition files and `.js.map` source maps

### Watch Mode (Development)

```bash
# Auto-recompile on file changes
npx tsc --watch
```

### Clean Build

```bash
rm -rf dist/
npm run build
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
npm run build
```

**Start production server:**
```bash
npm start
# Runs: node dist/index.js
```

**Development mode:**
```bash
npm run dev
# 1. Compiles TypeScript
# 2. Starts the server
```

### Test Scripts

```bash
npm test               # Integration tests (test/integration-test.js)
npm run test:correctness  # Mathematical correctness tests
npm run test:unit         # Vitest unit tests
npm run test:security     # Vitest security tests (test/security/)
npm run test:coverage     # Vitest with coverage
npm run test:all          # test + test:correctness
```

### Code Quality Scripts

```bash
npm run type-check    # tsc --noEmit
npm run lint           # eslint on src/ and test/
npm run lint:fix       # eslint --fix
npm run format         # prettier --write
npm run format:check   # prettier --check
```

---

## Build Verification

### Verify TypeScript Build

```bash
# Check dist/ directory exists and index.js is present
npm run verify:dist
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
npm run build && npm test

# Expected:
# - TypeScript builds with 0 errors
# - Integration tests pass (12 tests)
```

---

## Build Optimization

TypeScript compiler options that affect build output size/speed (e.g.
`sourceMap`, `declaration`, `incremental`) are controlled entirely in
`tsconfig.json`. There is no separate optimization pass — `npm run build`
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
npm install

# 3. Build
npm run build

# 4. Verify
npm run verify:dist
npm test

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
npm install -g <tarball>
```

---

## Troubleshooting

### TypeScript Build Issues

**Issue:** `Cannot find module '@modelcontextprotocol/sdk'`
```bash
npm install
```

**Issue:** TypeScript compilation errors
```bash
npx tsc --version

# Clean build
rm -rf dist/ .tsbuildinfo
npm run build
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
npm run build
npm test
```

### Build Environment Issues

**Issue:** Different behavior on Windows vs Linux
```bash
git config core.autocrlf true  # Windows
git config core.autocrlf input # Linux/Mac

npm run build
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
npm run build && npm test

# BAD
npm test  # Using a stale build's compiled output is not the concern here,
          # since tests run against source/dist directly — but always
          # rebuild after source changes before testing manually.
```

### 2. Clean Builds for Production

```bash
rm -rf dist/ .tsbuildinfo
npm run build
```

### 3. Verify After Build

```bash
npm run verify:dist
npm test
```

### 4. Version Control

**Files to commit:**
- `src/` - Source code
- `package.json`, `tsconfig.json` - Config

**Files not committed (gitignored / regenerated):**
- `dist/` - Build output (regenerate with `npm run build`)
- `node_modules/` - Dependencies (reinstall with `npm install`)

---

## Summary

### Build Commands Quick Reference

```bash
# Standard build
npm run build

# Development mode
npm run dev

# Build verification
npm run build && npm test

# Clean and rebuild
rm -rf dist/ && npm run build

# Distribution package
npm pack
```

### Build Outputs

- **Production server:** `dist/index.js` (main entry point and `bin`)

### Build Success Criteria

- TypeScript compiles with 0 errors
- `dist/index.js` present (`npm run verify:dist`)
- Server starts without errors
- Integration tests pass (`npm test`)
