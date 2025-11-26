/**
 * @file parallel-executor.ts
 * @description Generic parallel execution framework for chunked operations
 *
 * Provides a unified pattern for distributing work across worker threads:
 * - Automatic chunking based on data size and worker availability
 * - Type-safe configuration for different operation types
 * - Consistent logging and performance tracking
 *
 * @module workers/parallel-executor
 * @since 3.5.0
 */

import { WorkerPool } from './worker-pool.js';
import { OperationType, WorkerResult } from './worker-types.js';
import { logger } from '../utils.js';

/**
 * Configuration for a parallel operation.
 * @template TInput - Type of input data
 * @template TChunk - Type of chunked data
 * @template TResult - Type of operation result (must be WorkerResult compatible)
 */
export interface ParallelOperationConfig<TInput, TChunk, TResult extends WorkerResult> {
  /** Operation name for logging */
  name: string;

  /** Worker operation type */
  operationType: OperationType;

  /** Minimum elements per chunk for efficiency */
  minChunkSize: number;

  /** Function to chunk input data */
  chunk: (input: TInput, numChunks: number) => ChunkData<TChunk>[];

  /** Function to create worker request data from chunk */
  createRequest: (chunk: ChunkData<TChunk>, input: TInput) => Record<string, unknown>;

  /** Function to merge chunk results into final result */
  merge: (results: TResult[], input: TInput, chunks: ChunkData<TChunk>[]) => TResult;
}

/**
 * Chunked data with metadata.
 */
export interface ChunkData<T> {
  data: T;
  startIndex: number;
  endIndex: number;
}

/**
 * Determines optimal chunk count based on data size and available workers.
 */
export function getOptimalChunkCount(
  dataSize: number,
  availableWorkers: number,
  minChunkSize: number
): number {
  const maxChunks = Math.floor(dataSize / minChunkSize);
  return Math.max(1, Math.min(availableWorkers, maxChunks));
}

/**
 * Executes an operation in parallel across worker threads.
 *
 * @template TInput - Input data type
 * @template TChunk - Chunk data type
 * @template TResult - Result type (must be WorkerResult compatible)
 * @param config - Operation configuration
 * @param input - Input data
 * @param pool - Worker pool
 * @param inputSize - Size of input for chunking (e.g., array length, matrix rows)
 * @returns Operation result
 */
export async function executeParallel<TInput, TChunk, TResult extends WorkerResult>(
  config: ParallelOperationConfig<TInput, TChunk, TResult>,
  input: TInput,
  pool: WorkerPool,
  inputSize: number
): Promise<TResult> {
  const startTime = performance.now();

  logger.debug(`Starting parallel ${config.name}`, { inputSize });

  // Determine optimal chunk count
  const numChunks = getOptimalChunkCount(
    inputSize,
    pool.getAvailableWorkerCount(),
    config.minChunkSize
  );

  // Chunk input data
  const chunks = config.chunk(input, numChunks);

  // Execute operation on each chunk in parallel
  const promises = chunks.map((chunk) =>
    pool.execute<TResult>({
      operation: config.operationType,
      data: config.createRequest(chunk, input),
    })
  );

  // Wait for all chunks
  const results = await Promise.all(promises);

  // Merge results
  const finalResult = config.merge(results, input, chunks);

  const duration = performance.now() - startTime;
  logger.debug(`Parallel ${config.name} completed`, {
    duration: `${duration.toFixed(2)}ms`,
    chunks: chunks.length,
  });

  return finalResult;
}

// ============================================================================
// Array Chunking Utilities
// ============================================================================

/**
 * Chunks an array into segments.
 */
export function chunkArray<T>(data: T[], numChunks: number): ChunkData<T[]>[] {
  const chunkSize = Math.ceil(data.length / numChunks);
  const chunks: ChunkData<T[]>[] = [];

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, data.length);
    if (start < data.length) {
      chunks.push({
        data: data.slice(start, end),
        startIndex: start,
        endIndex: end,
      });
    }
  }

  return chunks;
}

/**
 * Chunks a matrix by rows.
 */
export function chunkMatrixRows(matrix: number[][], numChunks: number): ChunkData<number[][]>[] {
  const rowsPerChunk = Math.ceil(matrix.length / numChunks);
  const chunks: ChunkData<number[][]>[] = [];

  for (let i = 0; i < numChunks; i++) {
    const start = i * rowsPerChunk;
    const end = Math.min(start + rowsPerChunk, matrix.length);
    if (start < matrix.length) {
      chunks.push({
        data: matrix.slice(start, end),
        startIndex: start,
        endIndex: end,
      });
    }
  }

  return chunks;
}

// ============================================================================
// Merge Utilities
// ============================================================================

/**
 * Merges array results by concatenation.
 */
export function mergeArrays<T>(results: T[][]): T[] {
  return results.flat();
}

/**
 * Merges matrix results by row concatenation.
 */
export function mergeMatrixRows(results: number[][][]): number[][] {
  return results.flat();
}

/**
 * Merges results by summing.
 */
export function mergeSum(results: number[]): number {
  return results.reduce((acc, val) => acc + val, 0);
}

/**
 * Merges results by finding minimum.
 */
export function mergeMin(results: number[]): number {
  return Math.min(...results);
}

/**
 * Merges results by finding maximum.
 */
export function mergeMax(results: number[]): number {
  return Math.max(...results);
}
