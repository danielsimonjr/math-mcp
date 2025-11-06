/**
 * @file matrix.cjs
 * @description JavaScript bindings for WASM matrix operations
 */

const fs = require('fs');
const path = require('path');

let wasmInstance = null;
let wasmMemory = null;
let memoryOffset = 1024; // Start allocating after first 1KB

/**
 * Initialize the WASM module
 * @returns {Promise<void>}
 */
async function init() {
  const wasmPath = path.join(__dirname, '../build/release.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);

  const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      abort: () => { throw new Error('WASM abort'); }
    }
  });

  wasmInstance = wasmModule.instance;
  wasmMemory = wasmInstance.exports.memory;

  // Grow memory to 256 pages (16MB)
  wasmMemory.grow(256);
}

/**
 * Allocate space for a Float64Array in WASM memory
 * @param {number[]} data - Array data to copy
 * @returns {number} - Pointer to allocated memory
 */
function allocateF64Array(data) {
  const byteLength = data.length * 8; // 8 bytes per f64

  // Align to 8-byte boundary
  const ptr = (memoryOffset + 7) & ~7;
  memoryOffset = ptr + byteLength;

  // Ensure we have enough memory
  const pagesNeeded = Math.ceil(memoryOffset / 65536);
  const currentPages = wasmMemory.buffer.byteLength / 65536;
  if (pagesNeeded > currentPages) {
    wasmMemory.grow(pagesNeeded - currentPages);
  }

  // Copy data into WASM memory
  const view = new Float64Array(wasmMemory.buffer, ptr, data.length);
  view.set(data);

  return ptr;
}

/**
 * Read Float64Array from WASM memory
 * @param {number} ptr - Pointer to memory
 * @param {number} length - Number of elements
 * @returns {Float64Array} - View of the data
 */
function getF64Array(ptr, length) {
  return new Float64Array(wasmMemory.buffer, ptr, length);
}

/**
 * Reset memory allocator (simple bump allocator reset)
 */
function resetMemory() {
  memoryOffset = 1024;
}

/**
 * Matrix multiplication wrapper
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {number[][]} - Result matrix
 */
function multiply(a, b) {
  resetMemory();

  const m = a.length;
  const n = a[0].length;
  const p = b[0].length;

  // Flatten and allocate
  const aFlat = a.flat();
  const bFlat = b.flat();

  const aPtr = allocateF64Array(aFlat);
  const bPtr = allocateF64Array(bFlat);
  const cPtr = allocateF64Array(new Array(m * p).fill(0));

  // Call WASM function
  if (m === n && n === p) {
    if (m >= 32) {
      wasmInstance.exports.multiplySquareBlockedRaw(aPtr, bPtr, cPtr, m);
    } else {
      wasmInstance.exports.multiplySquareRaw(aPtr, bPtr, cPtr, m);
    }
  } else {
    wasmInstance.exports.multiplyGeneralRaw(aPtr, bPtr, cPtr, m, n, p);
  }

  // Get result
  const cArray = getF64Array(cPtr, m * p);

  // Convert to 2D array
  const result = [];
  for (let i = 0; i < m; i++) {
    const row = [];
    for (let j = 0; j < p; j++) {
      row.push(cArray[i * p + j]);
    }
    result.push(row);
  }

  return result;
}

/**
 * Matrix transpose wrapper
 * @param {number[][]} a - Input matrix
 * @returns {number[][]} - Transposed matrix
 */
function transpose(a) {
  resetMemory();

  const rows = a.length;
  const cols = a[0].length;

  const aFlat = a.flat();
  const aPtr = allocateF64Array(aFlat);
  const bPtr = allocateF64Array(new Array(rows * cols).fill(0));

  if (rows === cols) {
    wasmInstance.exports.transposeSquareRaw(aPtr, bPtr, rows);
  } else {
    wasmInstance.exports.transposeGeneralRaw(aPtr, bPtr, rows, cols);
  }

  const bArray = getF64Array(bPtr, rows * cols);

  const result = [];
  for (let i = 0; i < cols; i++) {
    const row = [];
    for (let j = 0; j < rows; j++) {
      row.push(bArray[i * rows + j]);
    }
    result.push(row);
  }

  return result;
}

/**
 * Matrix determinant wrapper
 * @param {number[][]} a - Input matrix (must be square)
 * @returns {number} - Determinant value
 */
function det(a) {
  resetMemory();

  const size = a.length;
  const aFlat = a.flat();
  const aPtr = allocateF64Array(aFlat);

  const result = wasmInstance.exports.determinantRaw(aPtr, size);
  return result;
}

/**
 * Matrix addition wrapper
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {number[][]} - Result matrix
 */
function add(a, b) {
  resetMemory();

  const rows = a.length;
  const cols = a[0].length;

  const aFlat = a.flat();
  const bFlat = b.flat();

  const aPtr = allocateF64Array(aFlat);
  const bPtr = allocateF64Array(bFlat);
  const cPtr = allocateF64Array(new Array(rows * cols).fill(0));

  if (rows === cols) {
    wasmInstance.exports.addSquareRaw(aPtr, bPtr, cPtr, rows);
  } else {
    wasmInstance.exports.addGeneralRaw(aPtr, bPtr, cPtr, rows, cols);
  }

  const cArray = getF64Array(cPtr, rows * cols);

  const result = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push(cArray[i * cols + j]);
    }
    result.push(row);
  }

  return result;
}

/**
 * Matrix subtraction wrapper
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {number[][]} - Result matrix
 */
function subtract(a, b) {
  resetMemory();

  const rows = a.length;
  const cols = a[0].length;

  const aFlat = a.flat();
  const bFlat = b.flat();

  const aPtr = allocateF64Array(aFlat);
  const bPtr = allocateF64Array(bFlat);
  const cPtr = allocateF64Array(new Array(rows * cols).fill(0));

  if (rows === cols) {
    wasmInstance.exports.subtractSquareRaw(aPtr, bPtr, cPtr, rows);
  } else {
    wasmInstance.exports.subtractGeneralRaw(aPtr, bPtr, cPtr, rows, cols);
  }

  const cArray = getF64Array(cPtr, rows * cols);

  const result = [];
  for (let i = 0; i < rows; i++) {
    const row = [];
    for (let j = 0; j < cols; j++) {
      row.push(cArray[i * cols + j]);
    }
    result.push(row);
  }

  return result;
}

module.exports = {
  init,
  multiply,
  transpose,
  det,
  add,
  subtract
};
