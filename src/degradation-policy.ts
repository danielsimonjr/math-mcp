/**
 * @file degradation-policy.ts
 * @description Graceful degradation policy for acceleration tiers (Layer 2)
 *
 * This module defines the policy for falling back from higher-performance
 * acceleration tiers to lower tiers when failures occur or tiers are unavailable.
 *
 * **Fallback Chain:**
 * GPU → WebWorkers → WASM → mathjs
 *
 * Each tier can be enabled/disabled via environment variables.
 *
 * **Dependency Layer:** 2 (Depends on Layer 1: shared/logger)
 *
 * @module degradation-policy
 * @since 3.1.1
 */

import { logger } from './shared/logger.js';

/**
 * Acceleration tiers for mathematical operations.
 * String values used for logging and tier identification.
 *
 * @enum {string}
 */
export enum AccelerationTier {
  /** Pure JavaScript implementation (mathjs) - always available */
  MATHJS = 'mathjs',
  /** WebAssembly acceleration - 8-42x speedup */
  WASM = 'wasm',
  /** Multi-threaded WebWorkers with WASM - 3-15x over single-threaded WASM */
  WORKERS = 'workers',
  /** WebGPU acceleration - future implementation (not yet available) */
  GPU = 'gpu',
}

/**
 * Numeric tier priority for ordering (higher = better performance).
 */
const TIER_PRIORITY: Record<AccelerationTier, number> = {
  [AccelerationTier.MATHJS]: 0,
  [AccelerationTier.WASM]: 1,
  [AccelerationTier.WORKERS]: 2,
  [AccelerationTier.GPU]: 3,
};

/**
 * Degradation policy configuration.
 *
 * @interface DegradationPolicy
 */
export interface DegradationPolicy {
  /** Set of enabled acceleration tiers */
  enabledTiers: Set<AccelerationTier>;
  /** Preferred tier to attempt first */
  preferredTier: AccelerationTier;
  /** Ordered fallback chain (highest to lowest performance) */
  fallbackChain: AccelerationTier[];
  /** Whether to log when degradation occurs */
  notifyOnDegradation: boolean;
}

/**
 * Creates the default degradation policy based on environment variables.
 *
 * Environment variables:
 * - ENABLE_GPU: Enable WebGPU tier (default: false, not yet implemented)
 * - ENABLE_WORKERS: Enable WebWorkers tier (default: true)
 * - ENABLE_WASM: Enable WASM tier (default: true)
 * - NOTIFY_DEGRADATION: Log when degradation occurs (default: true)
 *
 * @returns {DegradationPolicy} The default degradation policy
 */
export function createDefaultPolicy(): DegradationPolicy {
  const enableGPU = process.env.ENABLE_GPU === 'true';
  const enableWorkers = process.env.ENABLE_WORKERS !== 'false'; // Default true
  const enableWASM = process.env.ENABLE_WASM !== 'false'; // Default true
  const notifyOnDegradation = process.env.NOTIFY_DEGRADATION !== 'false'; // Default true

  const enabledTiers = new Set<AccelerationTier>([AccelerationTier.MATHJS]); // Always enabled

  if (enableWASM) {
    enabledTiers.add(AccelerationTier.WASM);
  }

  if (enableWorkers) {
    enabledTiers.add(AccelerationTier.WORKERS);
  }

  if (enableGPU) {
    enabledTiers.add(AccelerationTier.GPU);
  }

  const fallbackChain = [
    AccelerationTier.GPU,
    AccelerationTier.WORKERS,
    AccelerationTier.WASM,
    AccelerationTier.MATHJS,
  ].filter((tier) => enabledTiers.has(tier));

  const policy: DegradationPolicy = {
    enabledTiers,
    preferredTier: fallbackChain[0] || AccelerationTier.MATHJS,
    fallbackChain,
    notifyOnDegradation,
  };

  logger.info('Degradation policy initialized', {
    enabledTiers: Array.from(enabledTiers),
    preferredTier: policy.preferredTier,
    fallbackChain: policy.fallbackChain,
  });

  return policy;
}

/**
 * Global degradation policy instance.
 */
export const degradationPolicy = createDefaultPolicy();

/**
 * Gets the current degradation policy.
 *
 * @returns {DegradationPolicy} The current policy
 */
export function getDegradationPolicy(): DegradationPolicy {
  return degradationPolicy;
}

/**
 * Checks if a specific acceleration tier is enabled.
 *
 * @param {AccelerationTier} tier - The tier to check
 * @returns {boolean} True if the tier is enabled
 */
export function isTierEnabled(tier: AccelerationTier): boolean {
  return degradationPolicy.enabledTiers.has(tier);
}

/**
 * Logs a degradation event when falling back to a lower tier.
 *
 * @param {string} operation - The operation being performed
 * @param {AccelerationTier} attemptedTier - The tier that failed
 * @param {AccelerationTier} fallbackTier - The tier being used instead
 * @param {Error} [error] - Optional error that caused the degradation
 */
export function logDegradation(
  operation: string,
  attemptedTier: AccelerationTier,
  fallbackTier: AccelerationTier,
  error?: Error
): void {
  if (!degradationPolicy.notifyOnDegradation) {
    return;
  }

  logger.warn('Acceleration tier degradation', {
    operation,
    attemptedTier,
    fallbackTier,
    error: error ? error.message : undefined,
  });
}

/**
 * Gets a human-readable description of the current acceleration configuration.
 *
 * @returns {string} Configuration description
 */
export function getConfigurationDescription(): string {
  const tiers = Array.from(degradationPolicy.enabledTiers)
    .sort((a, b) => TIER_PRIORITY[b] - TIER_PRIORITY[a]) // Sort high to low
    .join(' → ');

  return `Acceleration: ${tiers}`;
}
