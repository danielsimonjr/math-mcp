# Math-MCP Build Guide

**Project:** math-mcp
**Version:** 2.0.0-wasm
**Last Updated:** November 2, 2025

This guide covers the complete build process for the math-mcp project, including TypeScript compilation, WASM module building, and distribution preparation.

## Table of Contents

1. [Build Overview](#build-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [TypeScript Build](#typescript-build)
5. [WASM Build](#wasm-build)
6. [Build Scripts](#build-scripts)
7. [Build Verification](#build-verification)
8. [Build Optimization](#build-optimization)
9. [Distribution](#distribution)
10. [Troubleshooting](#troubleshooting)

---

## Build Overview

### Build Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  Source Files                                                │
├─────────────────────────────────────────────────────────────┤
│  TypeScript (src/)          AssemblyScript (wasm/assembly/) │
│  ├── index.ts               ├── matrix/                     │
│  ├── index-wasm.ts          │   ├── multiply.ts            │
│  └── wasm-wrapper.ts        │   ├── determinant.ts         │
│                              │   └── transpose.ts           │
│                              └── statistics/                │
│                                  ├── mean.ts                │
│                                  ├── median.ts              │
│                                  └── variance.ts            │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
               ▼                        ▼
      ┌────────────────┐     ┌──────────────────┐
      │ TypeScript     │     │ AssemblyScript   │
      │ Compiler (tsc) │     │ Compiler (asc)   │
      └────────┬───────┘     └────────┬─────────┘
               │                      │
               ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Build Output                                                │
├─────────────────────────────────────────────────────────────┤
│  JavaScript (dist/)         WASM (wasm/build/)              │
│  ├── index.js               ├── release.wasm                │
│  ├── index-wasm.js          ├── debug.wasm                  │
│  └── wasm-wrapper.js        └── *.wat (text format)         │
│                                                              │
│  Bindings (wasm/bindings/)                                  │
│  ├── matrix.cjs                                             │
│  └── statistics.cjs                                         │
└─────────────────────────────────────────────────────────────┘
```

### Build Outputs

**Primary Outputs:**
- `dist/index-wasm.js` - Production MCP server (WASM-accelerated) ⭐
- `dist/index.js` - Legacy MCP server (mathjs-only)
- `dist/wasm-wrapper.js` - WASM integration layer

**WASM Outputs:**
- `wasm/build/release.wasm` - Optimized WASM binary (production)
- `wasm/build/debug.wasm` - Debug WASM binary (development)
- `wasm/bindings/matrix.cjs` - Matrix operation bindings
- `wasm/bindings/statistics.cjs` - Statistics operation bindings

---

## Prerequisites

### Required Software

**Node.js:**
```bash
# Check version
node --version
# Required: v18.0.0 or higher
# Tested on: v25.0.0
```

**npm:**
```bash
# Check version
npm --version
# Required: v8.0.0 or higher
```

**TypeScript:**
```bash
# Installed as dev dependency
# Will be available after npm install
```

**AssemblyScript:**
```bash
# Installed in wasm/ subdirectory
# Will be available after npm install in wasm/
```

### Installation

```bash
# 1. Install project dependencies
cd C:/mcp-servers/math-mcp
npm install

# 2. Install WASM build dependencies
cd wasm
npm install

# Back to project root
cd ..
```

### Verify Installation

```bash
# Check TypeScript
npx tsc --version
# Expected: Version 5.9.3 or higher

# Check AssemblyScript
cd wasm
npx asc --version
# Expected: AssemblyScript Compiler version

cd ..
```

---

## Quick Start

### Standard Build

```bash
# From project root
npm run build

# This compiles:
# - src/*.ts → dist/*.js (TypeScript)
# - WASM modules are pre-built and in wasm/build/
```

### Full Rebuild (TypeScript + WASM)

```bash
# 1. Build TypeScript
npm run build

# 2. Rebuild WASM modules (if needed)
cd wasm
npm install  # If first time
npx gulp     # Rebuild WASM

cd ..
```

### Development Build

```bash
# Build and run in development mode
npm run dev

# This:
# 1. Compiles TypeScript
# 2. Starts the server
# 3. Shows console output
```

---

## TypeScript Build

### Build Configuration

**File:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "wasm"]
}
```

### Build Process

```bash
# Standard TypeScript compilation
npx tsc

# Or use npm script
npm run build
```

**What happens:**
1. TypeScript compiler reads `tsconfig.json`
2. Compiles all `.ts` files in `src/`
3. Outputs `.js` files to `dist/`
4. Generates `.d.ts` type definition files
5. Creates source maps (`.js.map`)

### Build Output Structure

```
dist/
├── index.js              # Legacy server (mathjs-only)
├── index.js.map          # Source map
├── index.d.ts            # Type definitions
├── index-wasm.js         # Production server (WASM-accelerated)
├── index-wasm.js.map     # Source map
├── index-wasm.d.ts       # Type definitions
├── wasm-wrapper.js       # WASM integration
├── wasm-wrapper.js.map   # Source map
└── wasm-wrapper.d.ts     # Type definitions
```

### TypeScript Compilation Options

**Watch mode (development):**
```bash
# Auto-recompile on file changes
npx tsc --watch
```

**Clean build:**
```bash
# Remove old build
rm -rf dist/

# Rebuild
npm run build
```

**Build with specific config:**
```bash
npx tsc --project tsconfig.json
```

---

## WASM Build

### Build Location

**Working directory:** `wasm/`

```bash
cd wasm
```

### Build Configuration

**File:** `wasm/asconfig.json`

```json
{
  "targets": {
    "debug": {
      "outFile": "build/debug.wasm",
      "textFile": "build/debug.wat",
      "sourceMap": true,
      "debug": true
    },
    "release": {
      "outFile": "build/release.wasm",
      "textFile": "build/release.wat",
      "sourceMap": true,
      "optimizeLevel": 3,
      "shrinkLevel": 2,
      "converge": true
    }
  },
  "options": {
    "bindings": "esm"
  }
}
```

### Build Process

**Using Gulp (Recommended):**
```bash
cd wasm

# Build all WASM modules
npx gulp

# Build specific module
npx gulp matrix
npx gulp statistics
```

**Using AssemblyScript directly:**
```bash
cd wasm

# Build release version
npx asc assembly/matrix/multiply.ts --config asconfig.json --target release

# Build debug version
npx asc assembly/matrix/multiply.ts --config asconfig.json --target debug
```

### What Gets Built

**Matrix Operations:**
- `assembly/matrix/multiply.ts` → WASM multiply function
- `assembly/matrix/determinant.ts` → WASM determinant function
- `assembly/matrix/transpose.ts` → WASM transpose function

**Statistics Operations:**
- `assembly/statistics/mean.ts` → WASM mean function
- `assembly/statistics/median.ts` → WASM median function
- `assembly/statistics/variance.ts` → WASM variance function
- `assembly/statistics/minmax.ts` → WASM min/max functions

### Build Outputs

```
wasm/build/
├── release.wasm         # Optimized binary (production)
├── release.wat          # WebAssembly text format
├── release.wasm.map     # Source map
├── debug.wasm           # Debug binary
├── debug.wat            # Debug text format
└── debug.wasm.map       # Debug source map
```

### WASM Build Options

**Debug build (larger, with debug info):**
```bash
npx asc assembly/matrix/multiply.ts --target debug
```

**Release build (optimized, smaller):**
```bash
npx asc assembly/matrix/multiply.ts --target release --optimize
```

**Build with specific optimization:**
```bash
# Maximum optimization
npx asc assembly/matrix/multiply.ts --optimizeLevel 3 --shrinkLevel 2

# Faster compile (development)
npx asc assembly/matrix/multiply.ts --optimizeLevel 0
```

---

## Build Scripts

### package.json Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index-wasm.js",
    "dev": "tsc && node dist/index-wasm.js"
  }
}
```

### Usage

**Build TypeScript:**
```bash
npm run build
```

**Start Production Server:**
```bash
npm start
# Runs: node dist/index-wasm.js
```

**Development Mode:**
```bash
npm run dev
# 1. Compiles TypeScript
# 2. Starts server
# 3. Shows console output
```

### wasm/package.json Scripts

```bash
cd wasm

# Build WASM modules
npm run build
# or
npx gulp

# Run tests
npm test

# Run benchmarks
npm run benchmark
```

---

## Build Verification

### Verify TypeScript Build

```bash
# Check dist/ directory exists
ls -la dist/

# Expected files:
# - index.js, index.d.ts, index.js.map
# - index-wasm.js, index-wasm.d.ts, index-wasm.js.map
# - wasm-wrapper.js, wasm-wrapper.d.ts, wasm-wrapper.js.map
```

**Test compiled output:**
```bash
# Quick test
node dist/index-wasm.js

# Should wait for JSON-RPC input (Ctrl+C to exit)
```

### Verify WASM Build

```bash
# Check WASM binaries exist
ls -la wasm/build/

# Expected files:
# - release.wasm (production)
# - debug.wasm (development)

# Check file sizes
ls -lh wasm/build/release.wasm
# Should be ~20-50 KB
```

**Test WASM loading:**
```bash
# Run integration tests
node test/integration-test.js

# Should show:
# ✓ WASM should be initialized
```

### Full Build Verification

```bash
# Complete build and test
npm run build && node test/integration-test.js

# Expected:
# - TypeScript builds successfully (0 errors)
# - 11/11 tests passing
# - WASM initialized correctly
```

---

## Build Optimization

### TypeScript Optimization

**Production build:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",        // Modern JavaScript
    "module": "ES2020",        // ESM modules
    "removeComments": true,    // Smaller output
    "sourceMap": false,        // Disable in production
    "declaration": false       // Skip .d.ts in production
  }
}
```

**Development build:**
```json
{
  "compilerOptions": {
    "sourceMap": true,         // Enable debugging
    "declaration": true,       // Generate .d.ts
    "incremental": true        // Faster rebuilds
  }
}
```

### WASM Optimization

**Maximum optimization (production):**
```bash
cd wasm

# Use release target with all optimizations
npx asc assembly/matrix/multiply.ts \
  --target release \
  --optimizeLevel 3 \
  --shrinkLevel 2 \
  --converge \
  --noAssert
```

**Optimization levels:**
- `--optimizeLevel 0` - No optimization (fast compile)
- `--optimizeLevel 1` - Basic optimization
- `--optimizeLevel 2` - Standard optimization
- `--optimizeLevel 3` - Maximum optimization (production)

**Size reduction:**
- `--shrinkLevel 0` - No shrinking
- `--shrinkLevel 1` - Basic shrinking
- `--shrinkLevel 2` - Maximum shrinking (production)

### Build Performance

**Parallel builds:**
```bash
# Build TypeScript and test in parallel
npm run build & node test/integration-test.js

# Wait for both to complete
wait
```

**Incremental builds:**
```bash
# TypeScript incremental compilation
# (Add to tsconfig.json)
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

# 3. Build production
npm run build

# 4. Verify
node test/integration-test.js

# 5. Test startup
node dist/index-wasm.js
```

### Distribution Package

**Files to include:**
```
math-mcp/
├── dist/                    # ✅ Include (compiled output)
│   ├── index-wasm.js
│   ├── index.js
│   └── wasm-wrapper.js
├── wasm/                    # ✅ Include (WASM modules)
│   ├── build/
│   │   ├── release.wasm
│   │   └── debug.wasm
│   └── bindings/
│       ├── matrix.cjs
│       └── statistics.cjs
├── package.json             # ✅ Include
├── package-lock.json        # ✅ Include
├── README.md                # ✅ Include
├── CHANGELOG.md             # ✅ Include
├── LICENSE                  # ✅ Include
├── src/                     # ❌ Exclude (source code)
├── node_modules/            # ❌ Exclude (reinstall)
├── test/                    # ❌ Exclude (optional)
└── docs/                    # ❌ Exclude (optional)
```

### npm Package

```bash
# Pack for distribution
npm pack

# Creates: math-mcp-2.0.0-wasm.tgz
```

### Global Installation

```bash
# Link globally for development
npm link

# Install globally from tarball
npm install -g math-mcp-2.0.0-wasm.tgz
```

---

## Troubleshooting

### TypeScript Build Issues

**Issue:** `Cannot find module '@modelcontextprotocol/sdk'`
```bash
# Solution: Install dependencies
npm install
```

**Issue:** TypeScript compilation errors
```bash
# Solution: Check TypeScript version
npx tsc --version

# Update if needed
npm install --save-dev typescript@latest

# Clean build
rm -rf dist/ .tsbuildinfo
npm run build
```

**Issue:** Module resolution errors
```bash
# Solution: Verify imports use .js extensions
# ✅ GOOD: import { x } from "./module.js";
# ❌ BAD:  import { x } from "./module";
```

### WASM Build Issues

**Issue:** `asc: command not found`
```bash
# Solution: Install AssemblyScript in wasm/
cd wasm
npm install
cd ..
```

**Issue:** WASM compilation fails
```bash
# Solution: Rebuild WASM from scratch
cd wasm
rm -rf build/ node_modules/
npm install
npx gulp

cd ..
```

**Issue:** WASM module not loading
```bash
# Solution: Check WASM files exist
ls -la wasm/build/
ls -la wasm/bindings/

# Rebuild if missing
cd wasm && npx gulp && cd ..
```

### Common Build Problems

**Issue:** Build succeeds but server crashes
```bash
# Check: Missing WASM binaries
ls wasm/build/release.wasm

# Check: Correct paths in wasm-wrapper.ts
grep "wasm" src/wasm-wrapper.ts
```

**Issue:** Performance not improving
```bash
# Check: Using index-wasm.js not index.js
# In package.json:
# "main": "dist/index-wasm.js"  ✅
# "main": "dist/index.js"        ❌
```

**Issue:** Tests fail after build
```bash
# Rebuild everything
npm run build
cd wasm && npx gulp && cd ..
node test/integration-test.js
```

### Build Environment Issues

**Issue:** Different behavior on Windows vs Linux
```bash
# Check: Line endings
git config core.autocrlf true  # Windows
git config core.autocrlf input # Linux/Mac

# Rebuild
npm run build
```

**Issue:** Permission errors
```bash
# Linux/Mac: Make files executable
chmod +x dist/index-wasm.js

# Windows: Run as administrator if needed
```

---

## Build Best Practices

### 1. Always Build Before Testing

```bash
# ✅ GOOD
npm run build && node test/integration-test.js

# ❌ BAD
node test/integration-test.js  # Using old build
```

### 2. Clean Builds for Production

```bash
# Remove all build artifacts
rm -rf dist/ wasm/build/ .tsbuildinfo

# Fresh build
npm run build
cd wasm && npx gulp && cd ..
```

### 3. Verify After Build

```bash
# Quick verification
node dist/index-wasm.js &
sleep 1
kill %1

# Full verification
node test/integration-test.js
```

### 4. Version Control

**Files to commit:**
- ✅ `src/` - Source code
- ✅ `wasm/assembly/` - WASM source
- ✅ `package.json`, `tsconfig.json` - Config
- ❌ `dist/` - Build output (regenerate)
- ❌ `wasm/build/` - WASM binaries (regenerate)
- ❌ `node_modules/` - Dependencies (reinstall)

**Exception:** May include `wasm/build/` for convenience

---

## Summary

### Build Commands Quick Reference

```bash
# Standard TypeScript build
npm run build

# Full rebuild (TypeScript + WASM)
npm run build && cd wasm && npx gulp && cd ..

# Development mode
npm run dev

# Build verification
npm run build && node test/integration-test.js

# Clean and rebuild
rm -rf dist/ && npm run build

# Distribution package
npm pack
```

### Build Outputs

- **Production server:** `dist/index-wasm.js` (main entry point)
- **WASM binaries:** `wasm/build/release.wasm` (used in production)
- **Bindings:** `wasm/bindings/*.cjs` (JavaScript ↔ WASM)

### Build Success Criteria

- ✅ TypeScript compiles with 0 errors
- ✅ All output files present in dist/
- ✅ WASM binaries present in wasm/build/
- ✅ Server starts without errors
- ✅ Integration tests pass (11/11)
- ✅ WASM initializes correctly

---

**Last Updated:** November 2, 2025
**Build Status:** ✅ All builds passing
**TypeScript Version:** 5.9.3
**AssemblyScript Version:** Latest
**Node.js Version:** 18.0.0+ (tested on 25.0.0)
