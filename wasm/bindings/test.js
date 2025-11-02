// SPDX-License-Identifier: Apache-2.0
/**
 * @file test.js
 * @description Test script for WASM bindings
 */

import { add, testMatrixMultiply } from './index.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log('  mathjs-wasm WASM Module Test');
  console.log('='.repeat(60));

  try {
    // Test 1: Simple addition
    console.log('\n[Test 1] WASM Addition');
    const result1 = await add(5.5, 3.2);
    console.log(`  add(5.5, 3.2) = ${result1}`);
    console.log(`  Expected: 8.7`);
    console.log(`  ✅ ${Math.abs(result1 - 8.7) < 0.0001 ? 'PASS' : 'FAIL'}`);

    // Test 2: Matrix multiply placeholder
    console.log('\n[Test 2] Matrix Multiply Test');
    const result2 = await testMatrixMultiply(100);
    console.log(`  testMatrixMultiply(100) = ${result2}`);
    console.log(`  Expected: 10000`);
    console.log(`  ✅ ${result2 === 10000 ? 'PASS' : 'FAIL'}`);

    // Test 3: Large numbers
    console.log('\n[Test 3] Large Numbers');
    const result3 = await add(1e10, 2e10);
    console.log(`  add(1e10, 2e10) = ${result3}`);
    console.log(`  Expected: 3e10`);
    console.log(`  ✅ ${result3 === 3e10 ? 'PASS' : 'FAIL'}`);

    console.log('\n' + '='.repeat(60));
    console.log('  All tests completed!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
