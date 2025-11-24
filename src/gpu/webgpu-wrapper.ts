/**
 * @file webgpu-wrapper.ts
 * @description WebGPU acceleration layer stub (NOT IMPLEMENTED)
 *
 * ⚠️ WARNING: WebGPU acceleration is NOT currently implemented.
 * This module exists as a placeholder for future browser/Deno support.
 * All GPU functions will throw errors if called.
 *
 * WebGPU is not available in Node.js and requires browser environment.
 * Estimated implementation: Future version (4.0+)
 *
 * @module gpu/webgpu-wrapper
 * @since 3.0.0
 */

import { logger } from '../utils.js';
import { WasmError } from '../errors.js';

/**
 * Performance thresholds for WebGPU usage.
 * These are placeholder values for future implementation.
 *
 * @constant
 */
export const GPU_THRESHOLDS = {
  /** Use GPU for matrix multiply when matrices are >= 500×500 */
  matrix_multiply: 500,

  /** Use GPU for matrix transpose when matrices are >= 1000×1000 */
  matrix_transpose: 1000,

  /** Use GPU for matrix add/subtract when matrices are >= 1000×1000 */
  matrix_add_sub: 1000,

  /** Use GPU for statistics when arrays have >= 1,000,000 elements */
  statistics: 1000000,
} as const;

/**
 * WebGPU initialization status.
 * Always false in Node.js environment.
 */
export const gpuInitialized = false;

/**
 * Initializes WebGPU (NOT IMPLEMENTED).
 *
 * @returns {Promise<void>}
 */
export async function initWebGPU(): Promise<void> {
  logger.debug('WebGPU not available in Node.js environment - skipping initialization');
}

/**
 * Matrix multiplication using WebGPU (NOT IMPLEMENTED).
 *
 * @param {number[][]} _a - First matrix (unused)
 * @param {number[][]} _b - Second matrix (unused)
 * @returns {Promise<number[][]>} Never resolves
 * @throws {WasmError} Always throws - WebGPU not implemented
 */
export async function gpuMatrixMultiply(_a: number[][], _b: number[][]): Promise<number[][]> {
  throw new WasmError('WebGPU not implemented in Node.js environment');
}

/**
 * Statistical mean using WebGPU (NOT IMPLEMENTED).
 *
 * @param {number[]} _data - Input array (unused)
 * @returns {Promise<number>} Never resolves
 * @throws {WasmError} Always throws - WebGPU not implemented
 */
export async function gpuStatsMean(_data: number[]): Promise<number> {
  throw new WasmError('WebGPU not implemented in Node.js environment');
}

/**
 * Gets GPU performance statistics (stub).
 *
 * @returns {Object} Empty statistics
 */
export function getGPUPerfStats(): {
  gpuCalls: number;
  avgGpuTime: string;
  gpuInitialized: boolean;
} {
  return {
    gpuCalls: 0,
    avgGpuTime: '0.000ms',
    gpuInitialized: false,
  };
}

/**
 * Resets GPU performance counters (no-op).
 */
export function resetGPUPerfCounters(): void {
  // No-op
}

/**
 * Checks if GPU operation should be used (always false).
 *
 * @param {number} _size - Data size (unused)
 * @param {keyof typeof GPU_THRESHOLDS} _operation - Operation type (unused)
 * @returns {boolean} Always false
 */
export function shouldUseGPU(_size: number, _operation: keyof typeof GPU_THRESHOLDS): boolean {
  return false;
}
