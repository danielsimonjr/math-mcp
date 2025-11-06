/**
 * @file matrix-simple.cjs
 * @description Simplified JavaScript bindings for WASM matrix operations
 * Uses AssemblyScript loader for memory management
 */

const fs = require('fs');
const path = require('path');
const loader = require('@assemblyscript/loader');

let wasmModule = null;

/**
 * Initialize the WASM module
 * @returns {Promise<void>}
 */
async function init() {
  const wasmPath = path.join(__dirname, '../build/release.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);

  wasmModule = await loader.instantiate(wasmBuffer, {
    /* imports */
  });
}

/**
 * Matrix multiplication wrapper
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {number[][]} - Result matrix
 */
function multiply(a, b) {
  const m = a.length;
  const n = a[0].length;
  const p = b[0].length;

  // Flatten matrices
  const aFlat = a.flat();
  const bFlat = b.flat();

  // Create typed arrays in WASM memory
  const aPtr = wasmModule.__retain(wasmModule.__allocArray(wasmModule.Float64Array_ID, aFlat));
  const bPtr = wasmModule.__retain(wasmModule.__allocArray(wasmModule.Float64Array_ID, bFlat));
  const cPtr = wasmModule.__retain(wasmModule.__allocArray(wasmModule.Float64Array_ID, new Array(m * p).fill(0)));

  try {
    // Call WASM function
    if (m === n && n === p) {
      // Square matrix
      if (m >= 32) {
        wasmModule.multiplySquareBlocked(aPtr, bPtr, cPtr, m);
      } else {
        wasmModule.multiplySquare(aPtr, bPtr, cPtr, m);
      }
    } else {
      // General matrix
      wasmModule.multiplyGeneral(aPtr, bPtr, cPtr, m, n, p);
    }

    // Get result
    const cArray = wasmModule.__getArray(cPtr);

    // Convert back to 2D array
    const result = [];
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < p; j++) {
        row.push(cArray[i * p + j]);
      }
      result.push(row);
    }

    return result;
  } finally {
    wasmModule.__release(aPtr);
    wasmModule.__release(bPtr);
    wasmModule.__release(cPtr);
  }
}

/**
 * Matrix transpose wrapper
 * @param {number[][]} a - Input matrix
 * @returns {number[][]} - Transposed matrix
 */
function transpose(a) {
  const rows = a.length;
  const cols = a[0].length;

  const aFlat = a.flat();
  const aPtr = wasmModule.__retain(wasmModule.__allocArray(wasmModule.Float64Array_ID, aFlat));
  const bPtr = wasmModule.__retain(wasmModule.__allocArray(wasmModule.Float64Array_ID, new Array(cols * rows).fill(0)));

  try {
    if (rows === cols) {
      wasmModule.transposeSquare(aPtr, bPtr, rows);
    } else {
      wasmModule.transposeGeneral(aPtr, bPtr, rows, cols);
    }

    const bArray = wasmModule.__getArray(bPtr);

    const result = [];
    for (let i = 0; i < cols; i++) {
      const row = [];
      for (let j = 0; j < rows; j++) {
        row.push(bArray[i * rows + j]);
      }
      result.push(row);
    }

    return result;
  } finally {
    wasmModule.__release(aPtr);
    wasmModule.__release(bPtr);
  }
}

/**
 * Matrix determinant wrapper
 * @param {number[][]} a - Input matrix (must be square)
 * @returns {number} - Determinant value
 */
function det(a) {
  const size = a.length;
  const aFlat = a.flat();

  // Create a copy since determinant modifies the matrix
  const aPtr = wasmModule.__retain(wasmModule.__allocArray(wasmModule.Float64Array_ID, aFlat));

  try {
    const result = wasmModule.determinant(aPtr, size);
    return result;
  } finally {
    wasmModule.__release(aPtr);
  }
}

module.exports = {
  init,
  multiply,
  transpose,
  det
};
