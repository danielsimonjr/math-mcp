/**
 * @file routing-utils.ts
 * @description Generic tier-based routing utilities for acceleration operations
 *
 * Provides reusable routing logic for GPU → Workers → WASM → mathjs fallback chain.
 *
 * @module routing-utils
 * @since 3.3.0
 */

import { logger } from './utils.js';
import { AccelerationTier, isTierEnabled, logDegradation } from './degradation-policy.js';

/** Routing statistics tracker */
export interface RoutingStats {
  mathjsUsage: number;
  wasmUsage: number;
  workersUsage: number;
  gpuUsage: number;
}

/** Creates a new routing stats object */
export function createRoutingStats(): RoutingStats {
  return { mathjsUsage: 0, wasmUsage: 0, workersUsage: 0, gpuUsage: 0 };
}

/** Increments the usage counter for a tier */
export function incrementUsage(stats: RoutingStats, tier: AccelerationTier): void {
  switch (tier) {
    case AccelerationTier.GPU: stats.gpuUsage++; break;
    case AccelerationTier.WORKERS: stats.workersUsage++; break;
    case AccelerationTier.WASM: stats.wasmUsage++; break;
    case AccelerationTier.MATHJS: stats.mathjsUsage++; break;
  }
}

/** Configuration for a single tier in the routing chain */
export interface TierExecutor<TResult> {
  tier: AccelerationTier;
  shouldUse: () => boolean;
  execute: () => Promise<TResult>;
}

/** Configuration for a routed operation */
export interface RouteConfig<TResult> {
  operation: string;
  size: number;
  tiers: TierExecutor<TResult>[];
  fallback: () => TResult | Promise<TResult>;
}

/**
 * Routes an operation through the tier chain with fallback.
 *
 * @param config - Routing configuration
 * @param stats - Stats tracker to update
 * @returns Result and tier used
 */
export async function routeWithFallback<TResult>(
  config: RouteConfig<TResult>,
  stats: RoutingStats
): Promise<{ result: TResult; tier: AccelerationTier }> {
  const { operation, size, tiers, fallback } = config;

  // Try each tier in order
  for (let i = 0; i < tiers.length; i++) {
    const { tier, shouldUse, execute } = tiers[i];
    const nextTier = tiers[i + 1]?.tier ?? AccelerationTier.MATHJS;

    if (isTierEnabled(tier) && shouldUse()) {
      try {
        logger.debug(`Routing ${operation} to ${tier}`, { size });
        const result = await execute();
        incrementUsage(stats, tier);
        return { result, tier };
      } catch (error) {
        logDegradation(operation, tier, nextTier, error instanceof Error ? error : undefined);
      }
    }
  }

  // Fallback to mathjs
  logger.debug(`Routing ${operation} to mathjs`, { size });
  const result = await fallback();
  incrementUsage(stats, AccelerationTier.MATHJS);
  return { result, tier: AccelerationTier.MATHJS };
}

/**
 * Computes routing statistics summary.
 */
export function computeRoutingStatsSummary(
  stats: RoutingStats
): RoutingStats & { totalOps: number; accelerationRate: string } {
  const totalOps = stats.mathjsUsage + stats.wasmUsage + stats.workersUsage + stats.gpuUsage;
  const accelerated = stats.wasmUsage + stats.workersUsage + stats.gpuUsage;
  const accelerationRate = totalOps > 0 ? ((accelerated / totalOps) * 100).toFixed(1) + '%' : '0%';

  return { ...stats, totalOps, accelerationRate };
}
