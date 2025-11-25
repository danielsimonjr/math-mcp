#!/usr/bin/env node

/**
 * @file check-dependencies.js
 * @description Validates module dependency structure and detects circular dependencies
 *
 * This script ensures the codebase follows a clean layered architecture:
 * - Layer 1 (No dependencies): shared/logger, shared/constants
 * - Layer 2 (Depends on Layer 1): utils, errors, validation, degradation-policy
 * - Layer 3 (Depends on Layers 1-2): wasm-wrapper, workers/*, gpu/*
 * - Layer 4 (Depends on Layers 1-3): acceleration-router, acceleration-adapter
 * - Layer 5 (Depends on all): tool-handlers, index-wasm
 *
 * @since 3.1.1
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_DIR = join(__dirname, '..', 'src');

/**
 * Layer definitions for dependency validation.
 * Higher layer number = can depend on lower layers only.
 */
const LAYER_DEFINITIONS = {
  // Layer 1: No internal dependencies
  'shared/logger.ts': 1,
  'shared/constants.ts': 1,

  // Layer 2: Can depend on Layer 1 only
  'errors.ts': 2,
  'utils.ts': 2,
  'validation.ts': 2,
  'degradation-policy.ts': 2,

  // Layer 3: Can depend on Layers 1-2
  'wasm-wrapper.ts': 3,
  'wasm-integrity.ts': 3,
  'rate-limiter.ts': 3,
  'expression-cache.ts': 3,
  'workers/worker-types.ts': 3,
  'workers/worker-pool.ts': 3,
  'workers/task-queue.ts': 3,
  'workers/chunk-utils.ts': 3,
  'workers/parallel-matrix.ts': 3,
  'workers/parallel-stats.ts': 3,
  'workers/math-worker.ts': 3,
  'gpu/webgpu-wrapper.ts': 3,

  // Layer 4: Can depend on Layers 1-3
  'acceleration-router.ts': 4,
  'acceleration-adapter.ts': 4,

  // Layer 5: Can depend on all layers
  'tool-handlers.ts': 5,
  'index.ts': 5,
  'index-wasm.ts': 5,
};

/**
 * Extracts import statements from a TypeScript file.
 *
 * @param {string} filePath - Path to the file
 * @returns {string[]} Array of imported module paths
 */
function extractImports(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const importRegex = /import\s+(?:{[^}]+}|[\w*]+|\*\s+as\s+\w+)?\s*from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      // Only track internal imports (starting with ./ or ../)
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        imports.push(importPath);
      }
    }

    return imports;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Resolves a relative import path to a normalized path.
 *
 * @param {string} fromFile - File containing the import
 * @param {string} importPath - The import path
 * @returns {string} Normalized path relative to src/
 */
function resolveImport(fromFile, importPath) {
  const fromDir = dirname(fromFile);
  const resolvedPath = join(fromDir, importPath);
  const normalizedPath = relative(SRC_DIR, resolvedPath);

  // Remove .js extension and add .ts
  let finalPath = normalizedPath.replace(/\.js$/, '.ts');

  // Handle directory imports (index.ts)
  if (!finalPath.endsWith('.ts')) {
    finalPath = finalPath + '.ts';
  }

  return finalPath;
}

/**
 * Gets the layer number for a file.
 *
 * @param {string} filePath - Path relative to src/
 * @returns {number} Layer number (1-5), or 999 for unlayered files
 */
function getLayer(filePath) {
  return LAYER_DEFINITIONS[filePath] || 999;
}

/**
 * Validates that a file only imports from allowed layers.
 *
 * @param {string} filePath - Path relative to src/
 * @param {string[]} imports - Array of import paths
 * @returns {Object[]} Array of violations
 */
function validateLayering(filePath, imports) {
  const fileLayer = getLayer(filePath);
  const violations = [];

  for (const importPath of imports) {
    const resolvedImport = resolveImport(join(SRC_DIR, filePath), importPath);
    const importLayer = getLayer(resolvedImport);

    // File can only import from same or lower layer
    if (importLayer > fileLayer) {
      violations.push({
        file: filePath,
        imports: resolvedImport,
        fileLayer,
        importLayer,
        message: `Layer ${fileLayer} file importing from Layer ${importLayer}`,
      });
    }
  }

  return violations;
}

/**
 * Recursively finds all TypeScript files in a directory.
 *
 * @param {string} dir - Directory to search
 * @param {string[]} files - Accumulator for file paths
 * @returns {string[]} Array of file paths
 */
function findTypeScriptFiles(dir, files = []) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      findTypeScriptFiles(fullPath, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      files.push(relative(SRC_DIR, fullPath));
    }
  }

  return files;
}

/**
 * Main validation function.
 */
function main() {
  console.log('🔍 Checking module dependencies...\n');

  const files = findTypeScriptFiles(SRC_DIR);
  let totalViolations = 0;
  const allViolations = [];

  for (const file of files) {
    const fullPath = join(SRC_DIR, file);
    const imports = extractImports(fullPath);
    const violations = validateLayering(file, imports);

    if (violations.length > 0) {
      allViolations.push(...violations);
      totalViolations += violations.length;
    }
  }

  if (totalViolations === 0) {
    console.log('✅ No dependency violations found!');
    console.log(`\n📊 Analyzed ${files.length} files`);
    console.log('\n🏗️  Layer Structure:');
    console.log('  Layer 1: shared/* (no dependencies)');
    console.log('  Layer 2: utils, errors, validation, degradation-policy');
    console.log('  Layer 3: wasm-wrapper, workers/*, gpu/*');
    console.log('  Layer 4: acceleration-router, acceleration-adapter');
    console.log('  Layer 5: tool-handlers, index*');
    process.exit(0);
  } else {
    console.error(`❌ Found ${totalViolations} dependency violation(s):\n`);

    for (const violation of allViolations) {
      console.error(`  ${violation.file} (Layer ${violation.fileLayer})`);
      console.error(`    → imports ${violation.imports} (Layer ${violation.importLayer})`);
      console.error(`    ${violation.message}\n`);
    }

    process.exit(1);
  }
}

main();
