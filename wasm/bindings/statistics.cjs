/**
 * @file statistics.cjs
 * @description JavaScript bindings for WASM statistical operations
 */

const fs = require('fs');
const path = require('path');

let wasmInstance = null;
let wasmMemory = null;
let memoryOffset = 1024;

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
  wasmMemory.grow(256);
}

function allocateF64Array(data) {
  const byteLength = data.length * 8;
  const ptr = (memoryOffset + 7) & ~7;
  memoryOffset = ptr + byteLength;

  const pagesNeeded = Math.ceil(memoryOffset / 65536);
  const currentPages = wasmMemory.buffer.byteLength / 65536;
  if (pagesNeeded > currentPages) {
    wasmMemory.grow(pagesNeeded - currentPages);
  }

  const view = new Float64Array(wasmMemory.buffer, ptr, data.length);
  view.set(data);

  return ptr;
}

function resetMemory() {
  memoryOffset = 1024;
}

function mean(arr) {
  resetMemory();
  const ptr = allocateF64Array(arr);
  return wasmInstance.exports.meanRaw(ptr, arr.length);
}

function variance(arr, normalization = 'unbiased') {
  resetMemory();
  const ptr = allocateF64Array(arr);
  const norm = normalization === 'unbiased' ? 0 : 1;
  return wasmInstance.exports.varianceRaw(ptr, arr.length, norm);
}

function std(arr, normalization = 'unbiased') {
  resetMemory();
  const ptr = allocateF64Array(arr);
  const norm = normalization === 'unbiased' ? 0 : 1;
  return wasmInstance.exports.stdRaw(ptr, arr.length, norm);
}

function min(arr) {
  resetMemory();
  const ptr = allocateF64Array(arr);
  return wasmInstance.exports.minRaw(ptr, arr.length);
}

function max(arr) {
  resetMemory();
  const ptr = allocateF64Array(arr);
  return wasmInstance.exports.maxRaw(ptr, arr.length);
}

function median(arr) {
  resetMemory();
  // Make a copy since median modifies the array
  const copy = arr.slice();
  const ptr = allocateF64Array(copy);
  return wasmInstance.exports.medianRaw(ptr, copy.length);
}

function sum(arr) {
  resetMemory();
  const ptr = allocateF64Array(arr);
  return wasmInstance.exports.sumRaw(ptr, arr.length);
}

function product(arr) {
  resetMemory();
  const ptr = allocateF64Array(arr);
  return wasmInstance.exports.productRaw(ptr, arr.length);
}

function mode(arr) {
  resetMemory();
  // Make a copy since mode modifies the array (uses quicksort)
  const copy = arr.slice();
  const ptr = allocateF64Array(copy);
  return wasmInstance.exports.modeRaw(ptr, copy.length);
}

module.exports = {
  init,
  mean,
  variance,
  std,
  min,
  max,
  median,
  sum,
  product,
  mode
};
