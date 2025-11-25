/**
 * @file math-worker.ts
 * @description Worker thread implementation for parallel mathematical operations
 *
 * This module runs in a worker thread and processes mathematical operations
 * using WASM modules. Each worker loads its own WASM instances and processes
 * tasks independently.
 *
 * **Important:** This file is executed in a worker thread context, not the main thread.
 *
 * @module workers/math-worker
 * @since 3.0.0
 */

import { parentPort } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import {
  WorkerRequest,
  WorkerResponseSuccess,
  WorkerResponseError,
  OperationType,
  isMatrixOperationData,
  isStatsOperationData,
  MatrixOperationData,
  StatsOperationData,
} from './worker-types.js';

/**
 * WASM module instances (loaded on worker startup).
 */
/**
 * WASM module interface for matrix operations.
 * @interface WasmMatrixModule
 */
interface WasmMatrixModule {
  multiply(a: number[][], b: number[][]): number[][];
  det(matrix: number[][]): number;
  transpose(matrix: number[][]): number[][];
  add(a: number[][], b: number[][]): number[][];
  subtract(a: number[][], b: number[][]): number[][];
  init(): Promise<void>;
}

/**
 * WASM module interface for statistics operations.
 * @interface WasmStatsModule
 */
interface WasmStatsModule {
  mean(data: number[]): number;
  median(data: number[]): number;
  std(data: number[]): number;
  variance(data: number[]): number;
  min(data: number[]): number;
  max(data: number[]): number;
  sum(data: number[]): number;
  mode(data: number[]): number | number[];
  product(data: number[]): number;
  init(): Promise<void>;
}

let wasmMatrix: WasmMatrixModule | null = null;
let wasmStats: WasmStatsModule | null = null;
let wasmInitialized = false;

/**
 * Worker startup timestamp for uptime tracking.
 */
const workerStartTime = Date.now();

/**
 * Initializes WASM modules in the worker thread.
 *
 * Each worker loads its own instance of WASM modules to avoid
 * shared memory issues and enable parallel execution.
 *
 * @returns {Promise<void>}
 */
async function initWASM(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  try {
    // Get path to WASM bindings
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const wasmPath = join(__dirname, '../../wasm');

    // Load matrix bindings
    const matrixPath = pathToFileURL(join(wasmPath, 'bindings/matrix.cjs')).href;
    const matrixBindings = await import(matrixPath);
    await matrixBindings.init();
    wasmMatrix = matrixBindings;

    // Load statistics bindings
    const statsPath = pathToFileURL(join(wasmPath, 'bindings/statistics.cjs')).href;
    const statsBindings = await import(statsPath);
    await statsBindings.init();
    wasmStats = statsBindings;

    wasmInitialized = true;

    // Send initialization success message
    if (parentPort) {
      parentPort.postMessage({ type: 'init', success: true });
    }
  } catch (error) {
    wasmInitialized = false;
    wasmMatrix = null;
    wasmStats = null;

    // Send initialization failure message
    if (parentPort) {
      parentPort.postMessage({
        type: 'init',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Processes a matrix operation.
 *
 * @param {OperationType} operation - The operation type
 * @param {MatrixOperationData} data - The operation data
 * @returns {Promise<number | number[][] | number[]>} The result
 * @throws {Error} If operation fails or WASM not available
 */
async function processMatrixOperation(
  operation: OperationType,
  data: MatrixOperationData
): Promise<number | number[][] | number[]> {
  if (!wasmInitialized || !wasmMatrix) {
    throw new Error('WASM not initialized in worker');
  }

  const { matrixA, matrixB, startRow, endRow } = data;

  switch (operation) {
    case OperationType.MATRIX_MULTIPLY: {
      if (!matrixB) {
        throw new Error('matrix_b required for multiply operation');
      }

      // If processing a chunk (startRow/endRow specified)
      if (startRow !== undefined && endRow !== undefined) {
        // Multiply only the specified rows of A with entire B
        const chunkA = matrixA.slice(startRow, endRow);
        return wasmMatrix.multiply(chunkA, matrixB);
      }

      // Process entire matrices
      return wasmMatrix.multiply(matrixA, matrixB);
    }

    case OperationType.MATRIX_TRANSPOSE: {
      if (startRow !== undefined && endRow !== undefined) {
        // Transpose only specified rows
        const chunkA = matrixA.slice(startRow, endRow);
        return wasmMatrix.transpose(chunkA);
      }

      return wasmMatrix.transpose(matrixA);
    }

    case OperationType.MATRIX_ADD: {
      if (!matrixB) {
        throw new Error('matrix_b required for add operation');
      }

      if (startRow !== undefined && endRow !== undefined) {
        const chunkA = matrixA.slice(startRow, endRow);
        const chunkB = matrixB.slice(startRow, endRow);
        return wasmMatrix.add(chunkA, chunkB);
      }

      return wasmMatrix.add(matrixA, matrixB);
    }

    case OperationType.MATRIX_SUBTRACT: {
      if (!matrixB) {
        throw new Error('matrix_b required for subtract operation');
      }

      if (startRow !== undefined && endRow !== undefined) {
        const chunkA = matrixA.slice(startRow, endRow);
        const chunkB = matrixB.slice(startRow, endRow);
        return wasmMatrix.subtract(chunkA, chunkB);
      }

      return wasmMatrix.subtract(matrixA, matrixB);
    }

    case OperationType.MATRIX_DETERMINANT: {
      // Determinant cannot be chunked (requires full matrix)
      return wasmMatrix.det(matrixA);
    }

    case OperationType.MATRIX_INVERSE: {
      // Inverse cannot be chunked (requires full matrix)
      // Note: This will be implemented in Phase 2
      throw new Error('Matrix inverse not yet implemented in WASM');
    }

    default:
      throw new Error(`Unknown matrix operation: ${operation}`);
  }
}

/**
 * Processes a statistics operation.
 *
 * @param {OperationType} operation - The operation type
 * @param {StatsOperationData} data - The operation data
 * @returns {Promise<number | number[]>} The result
 * @throws {Error} If operation fails or WASM not available
 */
async function processStatsOperation(
  operation: OperationType,
  data: StatsOperationData
): Promise<number | number[]> {
  if (!wasmInitialized || !wasmStats) {
    throw new Error('WASM not initialized in worker');
  }

  const { data: array, startIndex, endIndex, params } = data;

  // Extract chunk if indices specified
  const chunk =
    startIndex !== undefined && endIndex !== undefined
      ? array.slice(startIndex, endIndex)
      : array;

  switch (operation) {
    case OperationType.STATS_MEAN:
      return wasmStats.mean(chunk);

    case OperationType.STATS_SUM:
      return wasmStats.sum(chunk);

    case OperationType.STATS_MIN:
      return wasmStats.min(chunk);

    case OperationType.STATS_MAX:
      return wasmStats.max(chunk);

    case OperationType.STATS_VARIANCE: {
      const normalization = params?.normalization || 0; // 0 = unbiased (n-1)
      // Note: Current WASM variance uses default normalization
      // Future enhancement: support normalization parameter
      return wasmStats.variance(chunk);
    }

    case OperationType.STATS_STD: {
      return wasmStats.std(chunk);
    }

    case OperationType.STATS_MEDIAN: {
      // Note: Median requires sorting, so chunking is complex
      // For now, process full array if no chunking specified
      if (startIndex !== undefined || endIndex !== undefined) {
        throw new Error('Median chunking not yet supported - requires full array');
      }
      return wasmStats.median(array);
    }

    default:
      throw new Error(`Unknown statistics operation: ${operation}`);
  }
}

/**
 * Processes a work request from the main thread.
 *
 * @param {WorkerRequest} request - The work request
 * @returns {Promise<WorkerResponseSuccess | WorkerResponseError>} The response
 */
async function processRequest(
  request: WorkerRequest
): Promise<WorkerResponseSuccess | WorkerResponseError> {
  const startTime = Date.now();

  try {
    let result: number | number[] | number[][];

    // Route to appropriate processor
    if (
      request.operation === OperationType.MATRIX_MULTIPLY ||
      request.operation === OperationType.MATRIX_TRANSPOSE ||
      request.operation === OperationType.MATRIX_ADD ||
      request.operation === OperationType.MATRIX_SUBTRACT ||
      request.operation === OperationType.MATRIX_DETERMINANT ||
      request.operation === OperationType.MATRIX_INVERSE
    ) {
      if (!isMatrixOperationData(request.data)) {
        throw new Error('Invalid data format for matrix operation');
      }
      result = await processMatrixOperation(request.operation, request.data);
    } else if (
      request.operation === OperationType.STATS_MEAN ||
      request.operation === OperationType.STATS_SUM ||
      request.operation === OperationType.STATS_MIN ||
      request.operation === OperationType.STATS_MAX ||
      request.operation === OperationType.STATS_VARIANCE ||
      request.operation === OperationType.STATS_STD ||
      request.operation === OperationType.STATS_MEDIAN
    ) {
      if (!isStatsOperationData(request.data)) {
        throw new Error('Invalid data format for statistics operation');
      }
      result = await processStatsOperation(request.operation, request.data);
    } else {
      throw new Error(`Unknown operation type: ${request.operation}`);
    }

    const executionTime = Date.now() - startTime;

    // Build success response
    const response: WorkerResponseSuccess = {
      id: request.id,
      success: true,
      result,
    };

    // Add performance metrics if requested
    if (request.trackPerformance) {
      response.performance = {
        executionTime,
      };
    }

    return response;
  } catch (error) {
    // Build error response
    const response: WorkerResponseError = {
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };

    return response;
  }
}

/**
 * Worker entry point.
 *
 * Sets up message handling and initializes WASM.
 */
async function main(): Promise<void> {
  if (!parentPort) {
    throw new Error('This module must be run as a worker thread');
  }

  // Initialize WASM
  await initWASM();

  // Set up message handler
  parentPort.on('message', async (request: WorkerRequest) => {
    const response = await processRequest(request);
    if (parentPort) {
      parentPort.postMessage(response);
    }
  });

  // Signal ready
  if (wasmInitialized) {
    parentPort.postMessage({
      type: 'ready',
      uptime: Date.now() - workerStartTime,
    });
  }
}

// Start the worker
main().catch((error) => {
  if (parentPort) {
    parentPort.postMessage({
      type: 'fatal_error',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  process.exit(1);
});
