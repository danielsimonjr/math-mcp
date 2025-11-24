#!/usr/bin/env node
/**
 * @file generate-wasm-hashes.js
 * @description Generates SHA-256 hashes of WASM binaries for integrity verification
 *
 * This script:
 * 1. Scans the wasm/build directory for .wasm files
 * 2. Computes SHA-256 hashes of each file
 * 3. Generates a JSON manifest (wasm-hashes.json)
 *
 * The manifest is used at runtime to verify WASM module integrity
 * before loading, preventing execution of tampered binaries.
 *
 * Usage: node scripts/generate-wasm-hashes.js
 */

import { createHash } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const WASM_DIR = join(PROJECT_ROOT, 'wasm/build');
const OUTPUT_FILE = join(PROJECT_ROOT, 'wasm-hashes.json');

/**
 * Computes SHA-256 hash of a file
 *
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computeFileHash(filePath) {
  const content = await readFile(filePath);
  const hash = createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Main function
 */
async function main() {
  console.log('🔒 Generating WASM integrity hashes...\n');

  // Check if WASM build directory exists
  if (!existsSync(WASM_DIR)) {
    console.error(`❌ Error: WASM build directory not found: ${WASM_DIR}`);
    console.error('   Run "npm run build:wasm" first to build WASM modules.');
    process.exit(1);
  }

  const hashes = {};
  const files = [
    'release.wasm',
    'debug.wasm',
  ];

  for (const file of files) {
    const filePath = join(WASM_DIR, file);

    if (!existsSync(filePath)) {
      console.warn(`⚠️  Warning: ${file} not found, skipping...`);
      continue;
    }

    try {
      const hash = await computeFileHash(filePath);
      const relativePath = relative(PROJECT_ROOT, filePath);

      hashes[relativePath] = {
        sha256: hash,
        algorithm: 'sha256',
        timestamp: new Date().toISOString(),
      };

      console.log(`✓ ${relativePath}`);
      console.log(`  SHA-256: ${hash}\n`);
    } catch (error) {
      console.error(`❌ Error hashing ${file}:`, error.message);
      process.exit(1);
    }
  }

  if (Object.keys(hashes).length === 0) {
    console.error('❌ Error: No WASM files found to hash.');
    process.exit(1);
  }

  // Write hashes to JSON file
  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    hashes,
  };

  await writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✅ Hash manifest written to: ${relative(PROJECT_ROOT, OUTPUT_FILE)}`);
  console.log(`📦 Hashed ${Object.keys(hashes).length} files`);
  console.log('\n✨ WASM integrity verification is now enabled!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
