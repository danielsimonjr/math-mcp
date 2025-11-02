/**
 * Working test for WASM matrix operations
 */

const fs = require('fs');
const path = require('path');

async function test() {
  const wasmPath = path.join(__dirname, '../build/release.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);

  const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      abort: () => { throw new Error('abort'); }
    }
  });

  const wasm = wasmModule.instance.exports;
  const memory = wasm.memory;

  // Grow memory to 256 pages (16MB)
  memory.grow(256);

  console.log('WASM loaded successfully');
  console.log('Memory size:', memory.buffer.byteLength, 'bytes');

  // Test simple 2x2 multiplication
  // A = [[1, 2], [3, 4]]
  // B = [[5, 6], [7, 8]]
  // C should be [[19, 22], [43, 50]]

  // Allocate at offset 1024 (after first page)
  const aPtr = 1024;
  const bPtr = 1024 + 64;  // 4 elements * 8 bytes + padding
  const cPtr = 1024 + 128;

  // Write data to memory
  const view = new Float64Array(memory.buffer);

  // Matrix A
  view[aPtr / 8 + 0] = 1;
  view[aPtr / 8 + 1] = 2;
  view[aPtr / 8 + 2] = 3;
  view[aPtr / 8 + 3] = 4;

  // Matrix B
  view[bPtr / 8 + 0] = 5;
  view[bPtr / 8 + 1] = 6;
  view[bPtr / 8 + 2] = 7;
  view[bPtr / 8 + 3] = 8;

  console.log('\nInput A:', Array.from(view.slice(aPtr / 8, aPtr / 8 + 4)));
  console.log('Input B:', Array.from(view.slice(bPtr / 8, bPtr / 8 + 4)));

  // Call WASM function
  wasm.multiplySquareRaw(aPtr, bPtr, cPtr, 2);

  console.log('Output C:', Array.from(view.slice(cPtr / 8, cPtr / 8 + 4)));
  console.log('Expected: [19, 22, 43, 50]');

  // Verify
  const expected = [19, 22, 43, 50];
  let passed = true;
  for (let i = 0; i < 4; i++) {
    const actual = view[cPtr / 8 + i];
    if (Math.abs(actual - expected[i]) > 0.0001) {
      passed = false;
      console.error(`Mismatch at index ${i}: got ${actual}, expected ${expected[i]}`);
    }
  }

  if (!passed) {
    console.error('\n✗ Test FAILED');
    process.exit(1);
  }

  console.log('\n✓ 2x2 matrix multiply test PASSED!');

  // Test 3x3 determinant
  // Matrix: [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
  // Determinant should be 0 (singular matrix)

  const detPtr = 2048;
  view[detPtr / 8 + 0] = 1;
  view[detPtr / 8 + 1] = 2;
  view[detPtr / 8 + 2] = 3;
  view[detPtr / 8 + 3] = 4;
  view[detPtr / 8 + 4] = 5;
  view[detPtr / 8 + 5] = 6;
  view[detPtr / 8 + 6] = 7;
  view[detPtr / 8 + 7] = 8;
  view[detPtr / 8 + 8] = 9;

  const det = wasm.determinantRaw(detPtr, 3);
  console.log('\n3x3 Determinant:', det);
  console.log('Expected: ~0 (singular matrix)');

  if (Math.abs(det) < 1e-10) {
    console.log('✓ Determinant test PASSED!');
  } else {
    console.error('✗ Determinant test FAILED');
    process.exit(1);
  }

  // Test transpose
  // Matrix: [[1, 2, 3], [4, 5, 6]]
  // Transpose: [[1, 4], [2, 5], [3, 6]]

  const transposeInPtr = 3072;
  const transposeOutPtr = 4096;

  view[transposeInPtr / 8 + 0] = 1;
  view[transposeInPtr / 8 + 1] = 2;
  view[transposeInPtr / 8 + 2] = 3;
  view[transposeInPtr / 8 + 3] = 4;
  view[transposeInPtr / 8 + 4] = 5;
  view[transposeInPtr / 8 + 5] = 6;

  wasm.transposeGeneralRaw(transposeInPtr, transposeOutPtr, 2, 3);

  const transposed = Array.from(view.slice(transposeOutPtr / 8, transposeOutPtr / 8 + 6));
  console.log('\nTranspose of 2x3:');
  console.log('Result:', transposed);
  console.log('Expected: [1, 4, 2, 5, 3, 6]');

  const expectedTranspose = [1, 4, 2, 5, 3, 6];
  let transposePassed = true;
  for (let i = 0; i < 6; i++) {
    if (Math.abs(transposed[i] - expectedTranspose[i]) > 0.0001) {
      transposePassed = false;
      console.error(`Mismatch at index ${i}`);
    }
  }

  if (transposePassed) {
    console.log('✓ Transpose test PASSED!');
  } else {
    console.error('✗ Transpose test FAILED');
    process.exit(1);
  }

  console.log('\n=== All basic tests PASSED! ===');
  return 0;
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
