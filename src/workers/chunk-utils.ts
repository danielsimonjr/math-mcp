/**
 * @file chunk-utils.ts
 * @description Utilities for splitting data into chunks for parallel processing
 *
 * This module provides functions to intelligently split matrices and arrays
 * into chunks that can be processed by different workers in parallel.
 *
 * @module workers/chunk-utils
 * @since 3.0.0
 */

import { DataChunk, ChunkOptions } from './worker-types.js';
import { logger } from '../utils.js';

/**
 * Default chunk options.
 *
 * @constant
 */
const DEFAULT_CHUNK_OPTIONS: Required<ChunkOptions> = {
  numChunks: 4,
  minChunkSize: 100,
  overlap: 0,
  strategy: 'EQUAL',
};

/**
 * Chunks a 1D array into roughly equal parts for parallel processing.
 *
 * **Strategy:**
 * - EQUAL: Divides array into equal-sized chunks
 * - ADAPTIVE: Adjusts chunk sizes based on array size and worker count
 *
 * @param {number[]} data - The array to chunk
 * @param {Partial<ChunkOptions>} [options] - Chunking options
 * @returns {DataChunk<number[]>[]} Array of data chunks
 *
 * @example
 * ```typescript
 * const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 * const chunks = chunkArray(data, { numChunks: 3 });
 * // Returns 3 chunks: [1,2,3,4], [5,6,7], [8,9,10]
 * ```
 */
export function chunkArray(
  data: number[],
  options?: Partial<ChunkOptions>
): DataChunk<number[]>[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const totalLength = data.length;

  // If data is too small, don't chunk
  if (totalLength < opts.minChunkSize || totalLength < opts.numChunks) {
    logger.debug('Array too small for chunking', {
      length: totalLength,
      minChunkSize: opts.minChunkSize,
    });

    return [
      {
        index: 0,
        totalChunks: 1,
        data: data,
        startIndex: 0,
        endIndex: totalLength,
        size: totalLength,
      },
    ];
  }

  const chunks: DataChunk<number[]>[] = [];
  const baseChunkSize = Math.floor(totalLength / opts.numChunks);
  const remainder = totalLength % opts.numChunks;

  let currentIndex = 0;

  for (let i = 0; i < opts.numChunks; i++) {
    // Distribute remainder across first chunks
    const chunkSize = baseChunkSize + (i < remainder ? 1 : 0);

    // Ensure we don't exceed array bounds
    const endIndex = Math.min(currentIndex + chunkSize, totalLength);

    // Apply overlap (for operations like median that need sorted data)
    const overlapStart = Math.max(0, currentIndex - opts.overlap);
    const overlapEnd = Math.min(totalLength, endIndex + opts.overlap);

    chunks.push({
      index: i,
      totalChunks: opts.numChunks,
      data: data.slice(overlapStart, overlapEnd),
      startIndex: currentIndex,
      endIndex: endIndex,
      size: endIndex - currentIndex,
    });

    currentIndex = endIndex;

    // Stop if we've covered all data
    if (currentIndex >= totalLength) {
      break;
    }
  }

  logger.debug('Array chunked for parallel processing', {
    totalLength,
    numChunks: chunks.length,
    avgChunkSize: Math.floor(totalLength / chunks.length),
  });

  return chunks;
}

/**
 * Chunks a matrix by rows for parallel processing.
 *
 * **Use Cases:**
 * - Matrix multiplication: Each worker computes a subset of result rows
 * - Matrix transpose: Each worker transposes a subset of rows
 * - Element-wise operations: Each worker processes a subset of rows
 *
 * @param {number[][]} matrix - The matrix to chunk (row-major order)
 * @param {Partial<ChunkOptions>} [options] - Chunking options
 * @returns {DataChunk<number[][]>[]} Array of matrix chunks
 *
 * @example
 * ```typescript
 * const matrix = [
 *   [1, 2, 3],
 *   [4, 5, 6],
 *   [7, 8, 9],
 *   [10, 11, 12]
 * ];
 * const chunks = chunkMatrixByRows(matrix, { numChunks: 2 });
 * // Chunk 0: rows 0-1 [[1,2,3], [4,5,6]]
 * // Chunk 1: rows 2-3 [[7,8,9], [10,11,12]]
 * ```
 */
export function chunkMatrixByRows(
  matrix: number[][],
  options?: Partial<ChunkOptions>
): DataChunk<number[][]>[] {
  const opts = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const numRows = matrix.length;

  // If matrix is too small, don't chunk
  if (numRows < opts.numChunks) {
    logger.debug('Matrix too small for row-based chunking', {
      numRows,
      numChunks: opts.numChunks,
    });

    return [
      {
        index: 0,
        totalChunks: 1,
        data: matrix,
        startIndex: 0,
        endIndex: numRows,
        size: numRows,
      },
    ];
  }

  const chunks: DataChunk<number[][]>[] = [];
  const baseChunkSize = Math.floor(numRows / opts.numChunks);
  const remainder = numRows % opts.numChunks;

  let currentRow = 0;

  for (let i = 0; i < opts.numChunks; i++) {
    const chunkSize = baseChunkSize + (i < remainder ? 1 : 0);
    const endRow = Math.min(currentRow + chunkSize, numRows);

    chunks.push({
      index: i,
      totalChunks: opts.numChunks,
      data: matrix.slice(currentRow, endRow),
      startIndex: currentRow,
      endIndex: endRow,
      size: endRow - currentRow,
    });

    currentRow = endRow;

    if (currentRow >= numRows) {
      break;
    }
  }

  logger.debug('Matrix chunked by rows', {
    totalRows: numRows,
    totalCols: matrix[0]?.length || 0,
    numChunks: chunks.length,
    avgChunkRows: Math.floor(numRows / chunks.length),
  });

  return chunks;
}

/**
 * Chunks a matrix by blocks (both rows and columns) for tiled operations.
 *
 * **Use Cases:**
 * - Blocked matrix multiplication (cache-efficient)
 * - Tiled transpose
 * - 2D convolutions
 *
 * @param {number[][]} matrix - The matrix to chunk
 * @param {number} blockSize - Size of each block (blockSize × blockSize)
 * @returns {Array} Array of matrix blocks with metadata
 *
 * @example
 * ```typescript
 * const matrix = [
 *   [1,  2,  3,  4],
 *   [5,  6,  7,  8],
 *   [9,  10, 11, 12],
 *   [13, 14, 15, 16]
 * ];
 * const blocks = chunkMatrixByBlocks(matrix, 2);
 * // Returns 4 blocks: [0,0], [0,1], [1,0], [1,1]
 * // Block [0,0] = [[1,2], [5,6]]
 * // Block [0,1] = [[3,4], [7,8]]
 * // etc.
 * ```
 */
export function chunkMatrixByBlocks(
  matrix: number[][],
  blockSize: number
): Array<{
  blockRow: number;
  blockCol: number;
  data: number[][];
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}> {
  const numRows = matrix.length;
  const numCols = matrix[0]?.length || 0;

  if (numRows === 0 || numCols === 0) {
    logger.warn('Cannot chunk empty matrix');
    return [];
  }

  const blocksPerRow = Math.ceil(numCols / blockSize);
  const blocksPerCol = Math.ceil(numRows / blockSize);
  const blocks: Array<{
    blockRow: number;
    blockCol: number;
    data: number[][];
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  }> = [];

  for (let blockRow = 0; blockRow < blocksPerCol; blockRow++) {
    for (let blockCol = 0; blockCol < blocksPerRow; blockCol++) {
      const startRow = blockRow * blockSize;
      const endRow = Math.min(startRow + blockSize, numRows);
      const startCol = blockCol * blockSize;
      const endCol = Math.min(startCol + blockSize, numCols);

      // Extract block data
      const blockData: number[][] = [];
      for (let i = startRow; i < endRow; i++) {
        blockData.push(matrix[i].slice(startCol, endCol));
      }

      blocks.push({
        blockRow,
        blockCol,
        data: blockData,
        startRow,
        startCol,
        endRow,
        endCol,
      });
    }
  }

  logger.debug('Matrix chunked by blocks', {
    totalRows: numRows,
    totalCols: numCols,
    blockSize,
    totalBlocks: blocks.length,
  });

  return blocks;
}

/**
 * Determines optimal number of chunks based on data size and available workers.
 *
 * **Strategy:**
 * - Small data: Don't parallelize (overhead > benefit)
 * - Medium data: Use fewer workers
 * - Large data: Use all available workers
 *
 * @param {number} dataSize - Size of data to process
 * @param {number} maxWorkers - Maximum available workers
 * @param {number} [minChunkSize=1000] - Minimum size for a chunk
 * @returns {number} Optimal number of chunks
 *
 * @example
 * ```typescript
 * getOptimalChunkCount(500, 8);        // Returns: 1 (too small to parallelize)
 * getOptimalChunkCount(10000, 8);      // Returns: 4 (use half workers)
 * getOptimalChunkCount(1000000, 8);    // Returns: 8 (use all workers)
 * ```
 */
export function getOptimalChunkCount(
  dataSize: number,
  maxWorkers: number,
  minChunkSize: number = 1000
): number {
  // Don't parallelize if data is too small
  if (dataSize < minChunkSize) {
    return 1;
  }

  // Calculate how many chunks we can create while respecting min size
  const maxPossibleChunks = Math.floor(dataSize / minChunkSize);

  // Use the smaller of maxWorkers or maxPossibleChunks
  const optimalChunks = Math.min(maxWorkers, maxPossibleChunks);

  logger.debug('Calculated optimal chunk count', {
    dataSize,
    maxWorkers,
    minChunkSize,
    optimalChunks,
  });

  return Math.max(1, optimalChunks);
}

/**
 * Merges chunked results back into a single array.
 * Assumes chunks are in order and non-overlapping.
 *
 * @param {DataChunk<number[]>[]} chunks - Array of chunks with results
 * @returns {number[]} Merged array
 *
 * @example
 * ```typescript
 * const chunks = [
 *   { data: [1, 2, 3], ... },
 *   { data: [4, 5, 6], ... },
 *   { data: [7, 8, 9], ... }
 * ];
 * const merged = mergeArrayChunks(chunks);
 * // Returns: [1, 2, 3, 4, 5, 6, 7, 8, 9]
 * ```
 */
export function mergeArrayChunks(chunks: DataChunk<number[]>[]): number[] {
  if (chunks.length === 0) {
    return [];
  }

  if (chunks.length === 1) {
    return chunks[0].data;
  }

  // Sort chunks by index to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

  // Calculate total size
  const totalSize = sortedChunks.reduce((sum, chunk) => sum + chunk.size, 0);

  // Pre-allocate result array for efficiency
  const result = new Array<number>(totalSize);
  let offset = 0;

  for (const chunk of sortedChunks) {
    // Copy chunk data to result
    for (let i = 0; i < chunk.data.length; i++) {
      result[offset + i] = chunk.data[i];
    }
    offset += chunk.size;
  }

  return result;
}

/**
 * Merges matrix row chunks back into a single matrix.
 *
 * @param {DataChunk<number[][]>[]} chunks - Array of row chunks
 * @returns {number[][]} Merged matrix
 *
 * @example
 * ```typescript
 * const chunks = [
 *   { data: [[1,2], [3,4]], ... },
 *   { data: [[5,6], [7,8]], ... }
 * ];
 * const merged = mergeMatrixRowChunks(chunks);
 * // Returns: [[1,2], [3,4], [5,6], [7,8]]
 * ```
 */
export function mergeMatrixRowChunks(chunks: DataChunk<number[][]>[]): number[][] {
  if (chunks.length === 0) {
    return [];
  }

  if (chunks.length === 1) {
    return chunks[0].data;
  }

  // Sort chunks by index
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

  // Concatenate all rows
  const result: number[][] = [];
  for (const chunk of sortedChunks) {
    result.push(...chunk.data);
  }

  return result;
}

/**
 * Validates that chunks cover the entire data range without gaps.
 *
 * @param {DataChunk<any>[]} chunks - Chunks to validate
 * @param {number} expectedSize - Expected total size
 * @returns {boolean} True if chunks are valid
 * @throws {Error} If chunks are invalid
 */
export function validateChunks(chunks: DataChunk<any>[], expectedSize: number): boolean {
  if (chunks.length === 0) {
    throw new Error('No chunks to validate');
  }

  // Sort by start index
  const sorted = [...chunks].sort((a, b) => a.startIndex - b.startIndex);

  // Check first chunk starts at 0
  if (sorted[0].startIndex !== 0) {
    throw new Error(`First chunk must start at 0, got ${sorted[0].startIndex}`);
  }

  // Check for gaps and overlaps
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    if (prev.endIndex !== curr.startIndex) {
      throw new Error(
        `Gap or overlap detected between chunks ${i - 1} and ${i}: ` +
          `prev.endIndex=${prev.endIndex}, curr.startIndex=${curr.startIndex}`
      );
    }
  }

  // Check last chunk ends at expected size
  const lastChunk = sorted[sorted.length - 1];
  if (lastChunk.endIndex !== expectedSize) {
    throw new Error(
      `Last chunk must end at ${expectedSize}, got ${lastChunk.endIndex}`
    );
  }

  logger.debug('Chunks validated successfully', {
    numChunks: chunks.length,
    totalSize: expectedSize,
  });

  return true;
}
