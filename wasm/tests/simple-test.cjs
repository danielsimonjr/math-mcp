/**
 * Simple test to verify WASM matrix operations work
 */

const fs = require('fs');
const path = require('path');

async function test() {
  const wasmPath = path.join(__dirname, '../build/release.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);

  // Create memory (256 pages = 16MB)
  

  const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
    env: {
      
      abort: () => { throw new Error('abort'); }
    }
  });

  const wasm = wasmModule.instance.exports;
  const memory = wasm.memory;

  console.log('WASM loaded successfully');
  console.log('Exports:', Object.keys(wasm).filter(k => !k.startsWith('_')));

  // Test simple 2x2 multiplication
  // A = [[1, 2], [3, 4]]
  // B = [[5, 6], [7, 8]]
  // C should be [[19, 22], [43, 50]]

  const aData = [1, 2, 3, 4];
  const bData = [5, 6, 7, 8];
  const cData = [0, 0, 0, 0];

  // Allocate at offset 1024 (after first page)
  const aPtr = 1024;
  const bPtr = 1024 + 32;  // 4 * 8 bytes
  const cPtr = 1024 + 64;

  // Write data
  const view = new Float64Array(memory.buffer);
  view[aPtr / 8] = 1;
  view[aPtr / 8 + 1] = 2;
  view[aPtr / 8 + 2] = 3;
  view[aPtr / 8 + 3] = 4;

  view[bPtr / 8] = 5;
  view[bPtr / 8 + 1] = 6;
  view[bPtr / 8 + 2] = 7;
  view[bPtr / 8 + 3] = 8;

  console.log('\nInput A:', [view[aPtr / 8], view[aPtr / 8 + 1], view[aPtr / 8 + 2], view[aPtr / 8 + 3]]);
  console.log('Input B:', [view[bPtr / 8], view[bPtr / 8 + 1], view[bPtr / 8 + 2], view[bPtr / 8 + 3]]);

  // Call WASM
  wasm.multiplySquareRaw(aPtr, bPtr, cPtr, 2);

  console.log('Output C:', [view[cPtr / 8], view[cPtr / 8 + 1], view[cPtr / 8 + 2], view[cPtr / 8 + 3]]);
  console.log('Expected: [19, 22, 43, 50]');

  // Verify
  const expected = [19, 22, 43, 50];
  let passed = true;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(view[cPtr / 8 + i] - expected[i]) > 0.0001) {
      passed = false;
      console.error(`Mismatch at index ${i}: got ${view[cPtr / 8 + i]}, expected ${expected[i]}`);
    }
  }

  if (passed) {
    console.log('\n✓ Test passed!');
  } else {
    console.error('\n✗ Test failed');
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
