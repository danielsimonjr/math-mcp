/**
 * @file worker-types.ts
 * @description Type definitions for WebWorker-based parallel mathematical operations
 *
 * This module defines the TypeScript interfaces and types used for communication
 * between the main thread and worker threads in the parallel computation system.
 *
 * @module workers/worker-types
 * @since 3.0.0
 */

import type { Worker } from 'worker_threads';

/**
 * Status of a worker in the pool.
 *
 * @enum {string}
 */
export enum WorkerStatus {
  /** Worker is idle and ready to accept tasks */
  IDLE = 'IDLE',
  /** Worker is currently processing a task */
  BUSY = 'BUSY',
  /** Worker encountered an error */
  ERROR = 'ERROR',
  /** Worker is being terminated */
  TERMINATING = 'TERMINATING',
}

/**
 * Types of mathematical operations that can be parallelized.
 *
 * @enum {string}
 */
export enum OperationType {
  // Matrix operations
  MATRIX_MULTIPLY = 'MATRIX_MULTIPLY',
  MATRIX_TRANSPOSE = 'MATRIX_TRANSPOSE',
  MATRIX_ADD = 'MATRIX_ADD',
  MATRIX_SUBTRACT = 'MATRIX_SUBTRACT',
  MATRIX_DETERMINANT = 'MATRIX_DETERMINANT',
  MATRIX_INVERSE = 'MATRIX_INVERSE',

  // Statistics operations
  STATS_MEAN = 'STATS_MEAN',
  STATS_SUM = 'STATS_SUM',
  STATS_MIN = 'STATS_MIN',
  STATS_MAX = 'STATS_MAX',
  STATS_VARIANCE = 'STATS_VARIANCE',
  STATS_STD = 'STATS_STD',
  STATS_MEDIAN = 'STATS_MEDIAN',
}

/**
 * Message sent from main thread to worker thread.
 *
 * @interface WorkerRequest
 */
export interface WorkerRequest {
  /** Unique identifier for this task */
  id: string;

  /** Type of operation to perform */
  operation: OperationType;

  /** Operation-specific data */
  data: WorkerRequestData;

  /** Optional performance tracking flag */
  trackPerformance?: boolean;
}

/**
 * Data payload for matrix operations.
 *
 * @interface MatrixOperationData
 */
export interface MatrixOperationData {
  /** First matrix (or only matrix for unary operations) */
  matrixA: number[][];

  /** Second matrix (for binary operations) */
  matrixB?: number[][];

  /** Start row index (for chunked operations) */
  startRow?: number;

  /** End row index (for chunked operations) */
  endRow?: number;

  /** Matrix dimensions */
  dimensions?: {
    rows: number;
    cols: number;
  };
}

/**
 * Data payload for statistics operations.
 *
 * @interface StatsOperationData
 */
export interface StatsOperationData {
  /** Data array to process */
  data: number[];

  /** Start index in array (for chunked operations) */
  startIndex?: number;

  /** End index in array (for chunked operations) */
  endIndex?: number;

  /** Additional parameters (e.g., normalization for variance) */
  params?: Record<string, any>;
}

/**
 * Union type for all operation data.
 *
 * @typedef {MatrixOperationData | StatsOperationData} WorkerRequestData
 */
export type WorkerRequestData = MatrixOperationData | StatsOperationData;

/**
 * Message sent from worker thread to main thread (success case).
 *
 * @interface WorkerResponseSuccess
 */
export interface WorkerResponseSuccess {
  /** Unique identifier matching the request */
  id: string;

  /** Success flag */
  success: true;

  /** Result of the operation */
  result: WorkerResult;

  /** Performance metrics (if tracking enabled) */
  performance?: {
    /** Execution time in milliseconds */
    executionTime: number;
    /** Memory used (if available) */
    memoryUsed?: number;
  };
}

/**
 * Message sent from worker thread to main thread (error case).
 *
 * @interface WorkerResponseError
 */
export interface WorkerResponseError {
  /** Unique identifier matching the request */
  id: string;

  /** Success flag */
  success: false;

  /** Error message */
  error: string;

  /** Error stack trace */
  stack?: string;
}

/**
 * Union type for worker responses.
 *
 * @typedef {WorkerResponseSuccess | WorkerResponseError} WorkerResponse
 */
export type WorkerResponse = WorkerResponseSuccess | WorkerResponseError;

/**
 * Result types for different operations.
 *
 * @typedef {number | number[] | number[][] | PartialResult} WorkerResult
 */
export type WorkerResult = number | number[] | number[][] | PartialResult;

/**
 * Partial result from a worker (to be combined with others).
 *
 * @interface PartialResult
 */
export interface PartialResult {
  /** Type of partial result */
  type: 'PARTIAL_SUM' | 'PARTIAL_ROWS' | 'PARTIAL_STATS';

  /** Partial data */
  data: any;

  /** Metadata for combining results */
  metadata: {
    /** Worker index that produced this result */
    workerIndex: number;
    /** Total number of workers */
    totalWorkers: number;
    /** Additional combine hints */
    [key: string]: any;
  };
}

/**
 * Task in the queue waiting to be processed.
 *
 * @interface Task
 */
export interface Task {
  /** Unique task identifier */
  id: string;

  /** Operation type */
  operation: OperationType;

  /** Task data */
  data: WorkerRequestData;

  /** Promise resolve function */
  resolve: (result: WorkerResult) => void;

  /** Promise reject function */
  reject: (error: Error) => void;

  /** Task priority (higher = more urgent) */
  priority?: number;

  /** Timestamp when task was created */
  createdAt: number;

  /** Performance tracking flag */
  trackPerformance?: boolean;
}

/**
 * Configuration options for the worker pool.
 *
 * @interface WorkerPoolConfig
 */
export interface WorkerPoolConfig {
  /**
   * Maximum number of workers in the pool.
   * Default: Number of CPU cores - 1 (to leave one for main thread)
   */
  maxWorkers?: number;

  /**
   * Minimum number of workers to keep alive.
   * Default: 2
   */
  minWorkers?: number;

  /**
   * Worker idle timeout in milliseconds.
   * Workers idle longer than this may be terminated.
   * Default: 60000 (1 minute)
   */
  workerIdleTimeout?: number;

  /**
   * Task timeout in milliseconds.
   * Tasks taking longer than this will be aborted.
   * Default: 30000 (30 seconds)
   */
  taskTimeout?: number;

  /**
   * Maximum queue size.
   * If queue exceeds this, new tasks will be rejected.
   * Default: 1000
   */
  maxQueueSize?: number;

  /**
   * Enable performance tracking.
   * Default: false (for production)
   */
  enablePerformanceTracking?: boolean;

  /**
   * Enable debug logging.
   * Default: false
   */
  enableDebugLogging?: boolean;
}

/**
 * Statistics about the worker pool.
 *
 * @interface WorkerPoolStats
 */
export interface WorkerPoolStats {
  /** Total number of workers */
  totalWorkers: number;

  /** Number of idle workers */
  idleWorkers: number;

  /** Number of busy workers */
  busyWorkers: number;

  /** Current queue size */
  queueSize: number;

  /** Total tasks completed */
  tasksCompleted: number;

  /** Total tasks failed */
  tasksFailed: number;

  /** Average task execution time (ms) */
  avgExecutionTime: number;

  /** Current memory usage (bytes, if available) */
  memoryUsage?: number;

  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Metadata about a worker instance.
 *
 * @interface WorkerMetadata
 */
export interface WorkerMetadata {
  /** Unique worker identifier */
  id: string;

  /** Current worker status */
  status: WorkerStatus;

  /** Worker instance */
  worker: Worker;

  /** Current task ID (if busy) */
  currentTaskId?: string;

  /** Number of tasks completed by this worker */
  tasksCompleted: number;

  /** Number of tasks failed by this worker */
  tasksFailed: number;

  /** Last activity timestamp */
  lastActivity: number;

  /** Worker creation timestamp */
  createdAt: number;
}

/**
 * Options for chunking data across workers.
 *
 * @interface ChunkOptions
 */
export interface ChunkOptions {
  /** Number of chunks to create (usually = number of workers) */
  numChunks: number;

  /** Minimum chunk size (prevent too-small chunks) */
  minChunkSize?: number;

  /** Overlap between chunks (for operations like median) */
  overlap?: number;

  /** Strategy for chunking */
  strategy?: 'EQUAL' | 'ADAPTIVE';
}

/**
 * A chunk of data to be processed by a worker.
 *
 * @interface DataChunk
 */
export interface DataChunk<T> {
  /** Chunk index (0-based) */
  index: number;

  /** Total number of chunks */
  totalChunks: number;

  /** The data in this chunk */
  data: T;

  /** Start index in original data */
  startIndex: number;

  /** End index in original data (exclusive) */
  endIndex: number;

  /** Chunk size */
  size: number;
}

/**
 * Result combiner function type.
 * Combines partial results from multiple workers into final result.
 *
 * @typedef {Function} ResultCombiner
 * @template T - Type of the final result
 * @param {PartialResult[]} partialResults - Array of partial results from workers
 * @returns {T} The combined final result
 */
export type ResultCombiner<T> = (partialResults: PartialResult[]) => T;

/**
 * Type guard to check if a response is successful.
 *
 * @param {WorkerResponse} response - The worker response to check
 * @returns {response is WorkerResponseSuccess} True if response is successful
 */
export function isSuccessResponse(
  response: WorkerResponse
): response is WorkerResponseSuccess {
  return response.success === true;
}

/**
 * Type guard to check if a response is an error.
 *
 * @param {WorkerResponse} response - The worker response to check
 * @returns {response is WorkerResponseError} True if response is an error
 */
export function isErrorResponse(response: WorkerResponse): response is WorkerResponseError {
  return response.success === false;
}

/**
 * Type guard to check if data is for matrix operations.
 *
 * @param {WorkerRequestData} data - The data to check
 * @returns {data is MatrixOperationData} True if data is for matrix operations
 */
export function isMatrixOperationData(
  data: WorkerRequestData
): data is MatrixOperationData {
  return 'matrixA' in data;
}

/**
 * Type guard to check if data is for statistics operations.
 *
 * @param {WorkerRequestData} data - The data to check
 * @returns {data is StatsOperationData} True if data is for statistics operations
 */
export function isStatsOperationData(data: WorkerRequestData): data is StatsOperationData {
  return 'data' in data && Array.isArray((data as StatsOperationData).data);
}
