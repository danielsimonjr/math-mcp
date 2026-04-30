/**
 * @file wasm-executor.ts
 * @description Generic WASM operation executor with automatic fallback to mathjs
 *
 * Provides a unified pattern for executing WASM operations with:
 * - Threshold-based routing (use WASM only for large enough inputs)
 * - Performance tracking
 * - Automatic fallback on WASM failures
 * - Consistent logging
 *
 * @module wasm-executor
 * @since 3.3.0
 */

import { logger } from './utils.js';

/** Performance tracking flag - can be disabled in production */
const PERF_TRACKING_ENABLED = process.env.DISABLE_PERF_TRACKING !== 'true';

/** Performance counters */
interface PerfCounters {
  wasmCalls: number;
  mathjsCalls: number;
  wasmTime: number;
  mathjsTime: number;
}

const perfCounters: PerfCounters = {
  wasmCalls: 0,
  mathjsCalls: 0,
  wasmTime: 0,
  mathjsTime: 0,
};

/**
 * Records performance metrics for an operation.
 */
export function recordPerf(type: 'wasm' | 'mathjs', duration: number): void {
  if (!PERF_TRACKING_ENABLED) return;
  if (type === 'wasm') {
    perfCounters.wasmCalls++;
    perfCounters.wasmTime += duration;
  } else {
    perfCounters.mathjsCalls++;
    perfCounters.mathjsTime += duration;
  }
}

/**
 * Gets current performance statistics.
 */
export function getPerfStats(): {
  wasmCalls: number;
  mathjsCalls: number;
  totalCalls: number;
  wasmPercentage: string;
  avgWasmTime: string;
  avgMathjsTime: string;
} {
  const totalCalls = perfCounters.wasmCalls + perfCounters.mathjsCalls;
  const wasmPct = totalCalls > 0 ? (perfCounters.wasmCalls / totalCalls) * 100 : 0;
  const avgWasmTime = perfCounters.wasmCalls > 0 ? perfCounters.wasmTime / perfCounters.wasmCalls : 0;
  const avgMathjsTime = perfCounters.mathjsCalls > 0 ? perfCounters.mathjsTime / perfCounters.mathjsCalls : 0;

  return {
    wasmCalls: perfCounters.wasmCalls,
    mathjsCalls: perfCounters.mathjsCalls,
    totalCalls,
    wasmPercentage: wasmPct.toFixed(1) + '%',
    avgWasmTime: avgWasmTime.toFixed(3) + 'ms',
    avgMathjsTime: avgMathjsTime.toFixed(3) + 'ms',
  };
}

/**
 * Resets performance counters.
 */
export function resetPerfCounters(): void {
  perfCounters.wasmCalls = 0;
  perfCounters.mathjsCalls = 0;
  perfCounters.wasmTime = 0;
  perfCounters.mathjsTime = 0;
  logger.debug('Performance counters reset');
}

/**
 * Configuration for a unary WASM operation (single input).
 */
export interface UnaryOperationConfig<TInput, TResult> {
  /** Operation name for logging */
  name: string;
  /** Minimum input size to use WASM */
  threshold: number;
  /** Function to get size from input */
  getSize: (input: TInput) => number;
  /** WASM implementation */
  wasmFn: (input: TInput) => TResult;
  /** mathjs fallback implementation */
  mathjsFn: (input: TInput) => TResult;
  /** Optional extra condition to use WASM (e.g., square matrix check) */
  extraCheck?: (input: TInput) => boolean;
}

/**
 * Configuration for a binary WASM operation (two inputs).
 */
export interface BinaryOperationConfig<TInputA, TInputB, TResult> {
  /** Operation name for logging */
  name: string;
  /** Minimum input size to use WASM */
  threshold: number;
  /** Function to get size from inputs */
  getSize: (a: TInputA, b: TInputB) => number;
  /** WASM implementation */
  wasmFn: (a: TInputA, b: TInputB) => TResult;
  /** mathjs fallback implementation */
  mathjsFn: (a: TInputA, b: TInputB) => TResult;
  /** Optional extra condition to use WASM */
  extraCheck?: (a: TInputA, b: TInputB) => boolean;
}

/**
 * Executes a unary operation with automatic WASM/mathjs routing.
 *
 * @param config - Operation configuration
 * @param input - Input data
 * @param wasmReady - Whether WASM module is initialized
 * @returns Operation result
 */
export async function executeUnaryOp<TInput, TResult>(
  config: UnaryOperationConfig<TInput, TResult>,
  input: TInput,
  wasmReady: boolean
): Promise<TResult> {
  const size = config.getSize(input);
  const useWASM = wasmReady &&
    size >= config.threshold &&
    (!config.extraCheck || config.extraCheck(input));

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM) {
      logger.debug(`Using WASM for ${config.name}`, { size });
      const result = config.wasmFn(input);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error(`WASM ${config.name} failed, falling back to mathjs`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug(`Using mathjs for ${config.name}`, { size });
  const result = config.mathjsFn(input);
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

/**
 * Executes a binary operation with automatic WASM/mathjs routing.
 *
 * @param config - Operation configuration
 * @param a - First input
 * @param b - Second input
 * @param wasmReady - Whether WASM module is initialized
 * @returns Operation result
 */
export async function executeBinaryOp<TInputA, TInputB, TResult>(
  config: BinaryOperationConfig<TInputA, TInputB, TResult>,
  a: TInputA,
  b: TInputB,
  wasmReady: boolean
): Promise<TResult> {
  const size = config.getSize(a, b);
  const useWASM = wasmReady &&
    size >= config.threshold &&
    (!config.extraCheck || config.extraCheck(a, b));

  const start = PERF_TRACKING_ENABLED ? performance.now() : 0;

  try {
    if (useWASM) {
      logger.debug(`Using WASM for ${config.name}`, { size });
      const result = config.wasmFn(a, b);
      if (PERF_TRACKING_ENABLED) {
        recordPerf('wasm', performance.now() - start);
      }
      return result;
    }
  } catch (error) {
    logger.error(`WASM ${config.name} failed, falling back to mathjs`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to mathjs
  logger.debug(`Using mathjs for ${config.name}`, { size });
  const result = config.mathjsFn(a, b);
  if (PERF_TRACKING_ENABLED) {
    recordPerf('mathjs', performance.now() - start);
  }
  return result;
}

