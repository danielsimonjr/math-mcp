// SPDX-License-Identifier: Apache-2.0
/**
 * @file index.js
 * @description JavaScript bindings for mathjs-wasm WASM modules
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let wasmInstance = null;

/**
 * Load the WASM module
 * @param {boolean} debug - Load debug or release build
 * @returns {Promise<WebAssembly.Instance>}
 */
export async function loadWasm(debug = false) {
  const wasmFile = debug ? 'debug.wasm' : 'release.wasm';
  const wasmPath = join(__dirname, '..', 'build', wasmFile);

  try {
    const wasmBinary = readFileSync(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmBinary);
    wasmInstance = await WebAssembly.instantiate(wasmModule, {
      env: {
        abort: (msg, file, line, column) => {
          console.error(`WASM abort: ${msg} at ${file}:${line}:${column}`);
        },
        seed: () => Date.now()
      }
    });
    console.log(`✅ WASM module loaded successfully: ${wasmFile}`);
    return wasmInstance;
  } catch (error) {
    console.error(`❌ Failed to load WASM module: ${error.message}`);
    throw error;
  }
}

/**
 * Get the WASM instance (lazy load if not loaded)
 * @returns {Promise<WebAssembly.Instance>}
 */
export async function getWasmInstance() {
  if (!wasmInstance) {
    await loadWasm();
  }
  return wasmInstance;
}

/**
 * Test function: Add two numbers using WASM
 * @param {number} a
 * @param {number} b
 * @returns {Promise<number>}
 */
export async function add(a, b) {
  const wasm = await getWasmInstance();
  return wasm.exports.add(a, b);
}

/**
 * Test function: Matrix multiply test
 * @param {number} size
 * @returns {Promise<number>}
 */
export async function testMatrixMultiply(size) {
  const wasm = await getWasmInstance();
  return wasm.exports.testMatrixMultiply(size);
}

// Graceful shutdown
process.on('exit', () => {
  if (wasmInstance) {
    // Cleanup if needed
  }
});
