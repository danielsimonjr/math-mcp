/**
 * @file parallel-matrix.ts
 * @description Parallel matrix operations using WebWorkers
 *
 * This module provides high-level functions for parallel matrix operations
 * that automatically chunk data and distribute work across worker threads.
 *
 * @module workers/parallel-matrix
 * @since 3.0.0
 */

import { WorkerPool } from './worker-pool.js';
import { OperationType } from './worker-types.js';
import {
  chunkMatrixByRows,
  mergeMatrixRowChunks,
  getOptimalChunkCount,
} from './chunk-utils.js';
import { logger } from '../utils.js';

/**
 * Thresholds for when to use parallel processing.
 * Below these sizes, single-threaded WASM is faster due to overhead.
 *
 * @constant
 */
export const PARALLEL_THRESHOLDS = {
  /** Use parallel processing for matrix multiply when size >= 100×100 */
  MATRIX_MULTIPLY: 100,

  /** Use parallel processing for matrix transpose when size >= 200×200 */
  MATRIX_TRANSPOSE: 200,

  /** Use parallel processing for matrix add/subtract when size >= 200×200 */
  MATRIX_ADD_SUB: 200,
} as const;

/**
 * Parallel matrix multiplication using worker pool.
 *
 * **Algorithm:**
 * 1. Split matrix A into row chunks
 * 2. Each worker multiplies its chunk of A with entire B
 * 3. Combine result chunks
 *
 * **Example:**
 * Matrix A (1000×1000) split into 4 chunks of 250 rows each
 * Worker 1: Rows 0-249 × B
 * Worker 2: Rows 250-499 × B
 * Worker 3: Rows 500-749 × B
 * Worker 4: Rows 750-999 × B
 *
 * @param {number[][]} a - First matrix (m×n)
 * @param {number[][]} b - Second matrix (n×p)
 * @param {WorkerPool} pool - Worker pool instance
 * @returns {Promise<number[][]>} Result matrix (m×p)
 *
 * @example
 * ```typescript
 * const a = create2DArray(1000, 1000);
 * const b = create2DArray(1000, 1000);
 * const result = await parallelMatrixMultiply(a, b, workerPool);
 * ```
 */
export async function parallelMatrixMultiply(
  a: number[][],
  b: number[][],
  pool: WorkerPool
): Promise<number[][]> {
  const startTime = performance.now();
  const size = a.length;

  logger.debug('Starting parallel matrix multiply', {
    sizeA: `${a.length}×${a[0]?.length || 0}`,
    sizeB: `${b.length}×${b[0]?.length || 0}`,
  });

  // Determine optimal chunk count
  const numChunks = getOptimalChunkCount(
    size,
    pool.getAvailableWorkerCount(),
    50 // Min 50 rows per chunk
  );

  // Chunk matrix A by rows
  const chunks = chunkMatrixByRows(a, { numChunks });

  // Process chunks in parallel
  const chunkPromises = chunks.map((chunk) => {
    return pool.execute<number[][]>({
      operation: OperationType.MATRIX_MULTIPLY,
      data: {
        matrixA: chunk.data,
        matrixB: b,
        startRow: chunk.startIndex,
        endRow: chunk.endIndex,
      },
    });
  });

  // Wait for all chunks
  const results = await Promise.all(chunkPromises);

  // Merge results
  const finalResult: number[][] = [];
  for (const result of results) {
    finalResult.push(...result);
  }

  const duration = performance.now() - startTime;
  logger.debug('Parallel matrix multiply completed', {
    duration: `${duration.toFixed(2)}ms`,
    chunks: chunks.length,
    resultSize: `${finalResult.length}×${finalResult[0]?.length || 0}`,
  });

  return finalResult;
}

/**
 * Parallel matrix transpose using worker pool.
 *
 * **Algorithm:**
 * 1. Split matrix into row chunks
 * 2. Each worker transposes its chunk
 * 3. Combine transposed chunks
 *
 * @param {number[][]} matrix - Matrix to transpose (m×n)
 * @param {WorkerPool} pool - Worker pool instance
 * @returns {Promise<number[][]>} Transposed matrix (n×m)
 *
 * @example
 * ```typescript
 * const matrix = create2DArray(1000, 1000);
 * const transposed = await parallelMatrixTranspose(matrix, workerPool);
 * ```
 */
export async function parallelMatrixTranspose(
  matrix: number[][],
  pool: WorkerPool
): Promise<number[][]> {
  const startTime = performance.now();
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;

  logger.debug('Starting parallel matrix transpose', {
    size: `${rows}×${cols}`,
  });

  // Determine optimal chunk count
  const numChunks = getOptimalChunkCount(
    rows,
    pool.getAvailableWorkerCount(),
    100 // Min 100 rows per chunk
  );

  // Chunk matrix by rows
  const chunks = chunkMatrixByRows(matrix, { numChunks });

  // Process chunks in parallel
  const chunkPromises = chunks.map((chunk) => {
    return pool.execute<number[][]>({
      operation: OperationType.MATRIX_TRANSPOSE,
      data: {
        matrixA: chunk.data,
        startRow: chunk.startIndex,
        endRow: chunk.endIndex,
      },
    });
  });

  // Wait for all chunks
  const results = await Promise.all(chunkPromises);

  // Note: Transposing chunks individually gives us transposed chunks
  // We need to reassemble them correctly
  // For simplicity, we'll flatten and reconstruct
  // TODO: Optimize this merge operation

  const transposed: number[][] = Array(cols)
    .fill(null)
    .map(() => Array(rows).fill(0));

  let currentRow = 0;
  for (let chunkIdx = 0; chunkIdx < results.length; chunkIdx++) {
    const transposedChunk = results[chunkIdx];
    const chunkRows = chunks[chunkIdx].size;

    // transposedChunk is cols×chunkRows
    // We need to place it correctly in the final cols×rows matrix
    for (let i = 0; i < transposedChunk.length; i++) {
      for (let j = 0; j < transposedChunk[i].length; j++) {
        transposed[i][currentRow + j] = transposedChunk[i][j];
      }
    }

    currentRow += chunkRows;
  }

  const duration = performance.now() - startTime;
  logger.debug('Parallel matrix transpose completed', {
    duration: `${duration.toFixed(2)}ms`,
    chunks: chunks.length,
    resultSize: `${transposed.length}×${transposed[0]?.length || 0}`,
  });

  return transposed;
}

/**
 * Parallel matrix addition using worker pool.
 *
 * **Algorithm:**
 * 1. Split both matrices into corresponding row chunks
 * 2. Each worker adds its pair of chunks
 * 3. Combine result chunks
 *
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix (same dimensions as a)
 * @param {WorkerPool} pool - Worker pool instance
 * @returns {Promise<number[][]>} Result matrix (a + b)
 *
 * @example
 * ```typescript
 * const a = create2DArray(1000, 1000);
 * const b = create2DArray(1000, 1000);
 * const sum = await parallelMatrixAdd(a, b, workerPool);
 * ```
 */
export async function parallelMatrixAdd(
  a: number[][],
  b: number[][],
  pool: WorkerPool
): Promise<number[][]> {
  const startTime = performance.now();
  const rows = a.length;

  logger.debug('Starting parallel matrix add', {
    size: `${a.length}×${a[0]?.length || 0}`,
  });

  // Determine optimal chunk count
  const numChunks = getOptimalChunkCount(
    rows,
    pool.getAvailableWorkerCount(),
    100 // Min 100 rows per chunk
  );

  // Chunk both matrices by rows
  const chunksA = chunkMatrixByRows(a, { numChunks });
  const chunksB = chunkMatrixByRows(b, { numChunks });

  // Process chunks in parallel
  const chunkPromises = chunksA.map((chunkA, index) => {
    const chunkB = chunksB[index];
    return pool.execute<number[][]>({
      operation: OperationType.MATRIX_ADD,
      data: {
        matrixA: chunkA.data,
        matrixB: chunkB.data,
        startRow: chunkA.startIndex,
        endRow: chunkA.endIndex,
      },
    });
  });

  // Wait for all chunks
  const results = await Promise.all(chunkPromises);

  // Merge results
  const finalResult: number[][] = [];
  for (const result of results) {
    finalResult.push(...result);
  }

  const duration = performance.now() - startTime;
  logger.debug('Parallel matrix add completed', {
    duration: `${duration.toFixed(2)}ms`,
    chunks: chunksA.length,
  });

  return finalResult;
}

/**
 * Parallel matrix subtraction using worker pool.
 *
 * **Algorithm:**
 * 1. Split both matrices into corresponding row chunks
 * 2. Each worker subtracts its pair of chunks
 * 3. Combine result chunks
 *
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix (same dimensions as a)
 * @param {WorkerPool} pool - Worker pool instance
 * @returns {Promise<number[][]>} Result matrix (a - b)
 *
 * @example
 * ```typescript
 * const a = create2DArray(1000, 1000);
 * const b = create2DArray(1000, 1000);
 * const diff = await parallelMatrixSubtract(a, b, workerPool);
 * ```
 */
export async function parallelMatrixSubtract(
  a: number[][],
  b: number[][],
  pool: WorkerPool
): Promise<number[][]> {
  const startTime = performance.now();
  const rows = a.length;

  logger.debug('Starting parallel matrix subtract', {
    size: `${a.length}×${a[0]?.length || 0}`,
  });

  // Determine optimal chunk count
  const numChunks = getOptimalChunkCount(
    rows,
    pool.getAvailableWorkerCount(),
    100 // Min 100 rows per chunk
  );

  // Chunk both matrices by rows
  const chunksA = chunkMatrixByRows(a, { numChunks });
  const chunksB = chunkMatrixByRows(b, { numChunks });

  // Process chunks in parallel
  const chunkPromises = chunksA.map((chunkA, index) => {
    const chunkB = chunksB[index];
    return pool.execute<number[][]>({
      operation: OperationType.MATRIX_SUBTRACT,
      data: {
        matrixA: chunkA.data,
        matrixB: chunkB.data,
        startRow: chunkA.startIndex,
        endRow: chunkA.endIndex,
      },
    });
  });

  // Wait for all chunks
  const results = await Promise.all(chunkPromises);

  // Merge results
  const finalResult: number[][] = [];
  for (const result of results) {
    finalResult.push(...result);
  }

  const duration = performance.now() - startTime;
  logger.debug('Parallel matrix subtract completed', {
    duration: `${duration.toFixed(2)}ms`,
    chunks: chunksA.length,
  });

  return finalResult;
}

/**
 * Determines if an operation should use parallel processing.
 *
 * @param {number} size - Matrix dimension (number of rows)
 * @param {'multiply' | 'transpose' | 'add' | 'subtract'} operation - Operation type
 * @returns {boolean} True if parallel processing is beneficial
 */
export function shouldUseParallel(
  size: number,
  operation: 'multiply' | 'transpose' | 'add' | 'subtract'
): boolean {
  switch (operation) {
    case 'multiply':
      return size >= PARALLEL_THRESHOLDS.MATRIX_MULTIPLY;
    case 'transpose':
      return size >= PARALLEL_THRESHOLDS.MATRIX_TRANSPOSE;
    case 'add':
    case 'subtract':
      return size >= PARALLEL_THRESHOLDS.MATRIX_ADD_SUB;
    default:
      return false;
  }
}
