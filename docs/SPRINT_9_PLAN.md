# Sprint 9: Advanced Features & Production Hardening
## Remaining Tasks from IMPLEMENTATION_PLAN.md

**Sprint Duration:** 6-8 weeks
**Priority:** Medium (Post-production enhancements)
**Status:** 🚧 In Progress

---

## Overview

Sprint 9 completes the remaining 4 tasks (19, 20, 22, 23) from the IMPLEMENTATION_PLAN.md that were identified as gaps in the verification report. These tasks add advanced production features:

1. **Task 19:** Dependency Injection for Worker Pool (Architecture)
2. **Task 20:** Backpressure Implementation (Resilience)
3. **Task 22:** Security Testing Suite (Security)
4. **Task 23:** Telemetry & Observability (Operations)

---

## Task 19: Dependency Injection for Worker Pool

**Complexity:** 🟠 Complex (2-3 weeks)
**Priority:** Medium
**Current State:** Global singleton pattern
**Goal:** Remove global state, enable dependency injection, support multiple pools

### Detailed Implementation Steps

#### Part 1: Remove Global Singleton (4-6 hours)

**Current Code (src/acceleration-router.ts):**
```typescript
let workerPool: WorkerPool | null = null;

async function getWorkerPool(): Promise<WorkerPool | null> {
  if (!workerPool) {
    workerPool = new WorkerPool(config);
    await workerPool.initialize();
  }
  return workerPool;
}
```

**Changes Required:**
1. Remove `let workerPool: WorkerPool | null = null;` global variable
2. Remove `getWorkerPool()` function
3. Update all references to use instance variable instead

**Files to Modify:**
- `src/acceleration-router.ts` (primary changes)
- `src/acceleration-adapter.ts` (if it references global pool)

**Testing:**
- Verify no compilation errors
- Ensure no runtime references to global variable

---

#### Part 2: Add WorkerPool to AccelerationRouter Constructor (6-8 hours)

**New Code:**
```typescript
// src/acceleration-router.ts
export interface RouterConfig {
  enableWorkers: boolean;
  workerPoolConfig: WorkerPoolConfig;
  degradationPolicy?: DegradationPolicy;
}

export class AccelerationRouter {
  private workerPool: WorkerPool | null = null;
  private readonly config: RouterConfig;

  constructor(config: RouterConfig, workerPool?: WorkerPool) {
    this.config = config;

    // Allow injection of pre-configured pool
    if (workerPool) {
      this.workerPool = workerPool;
    }
  }

  async initialize(): Promise<void> {
    // Only create pool if not injected and workers enabled
    if (!this.workerPool && this.config.enableWorkers) {
      this.workerPool = new WorkerPool(this.config.workerPoolConfig);
      await this.workerPool.initialize();
    }
  }

  async shutdown(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.shutdown();
      this.workerPool = null;
    }
  }

  // All routing methods now use this.workerPool instead of global
  private async routeToWorkers<T>(operation: Operation): Promise<T> {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized');
    }
    return this.workerPool.execute<T>(operation);
  }
}
```

**Changes Required:**
1. Add `config` and `workerPool` parameters to constructor
2. Store both as instance variables
3. Add `initialize()` method for lazy pool creation
4. Add `shutdown()` method for cleanup
5. Update all methods to use `this.workerPool`

**Files to Modify:**
- `src/acceleration-router.ts` (class definition)
- All files that instantiate `AccelerationRouter`

**Testing:**
- Unit tests for constructor with/without injected pool
- Verify initialize() creates pool only when needed
- Verify shutdown() cleans up properly

---

#### Part 3: Create WorkerPoolManager (8-12 hours)

**New File: src/workers/pool-manager.ts**
```typescript
import { WorkerPool } from './worker-pool.js';
import { WorkerPoolConfig } from './worker-types.js';
import { logger } from '../shared/logger.js';

/**
 * Manages multiple worker pools for different operation types
 *
 * @example
 * ```typescript
 * const manager = new WorkerPoolManager();
 *
 * // Create separate pools for matrix and stats
 * const matrixPool = manager.createPool('matrix', { maxWorkers: 4 });
 * const statsPool = manager.createPool('stats', { maxWorkers: 4 });
 *
 * // Get pool by name
 * const pool = manager.getPool('matrix');
 *
 * // Shutdown all pools
 * await manager.shutdownAll();
 * ```
 */
export class WorkerPoolManager {
  private readonly pools: Map<string, WorkerPool> = new Map();

  /**
   * Creates a new worker pool with the given name and configuration
   *
   * @param name - Unique name for the pool
   * @param config - Worker pool configuration
   * @returns The created worker pool
   * @throws Error if pool with name already exists
   */
  async createPool(
    name: string,
    config: WorkerPoolConfig
  ): Promise<WorkerPool> {
    if (this.pools.has(name)) {
      throw new Error(`Worker pool '${name}' already exists`);
    }

    logger.info('Creating worker pool', { name, config });

    const pool = new WorkerPool(config);
    await pool.initialize();

    this.pools.set(name, pool);

    return pool;
  }

  /**
   * Gets an existing worker pool by name
   *
   * @param name - Pool name
   * @returns The worker pool or undefined if not found
   */
  getPool(name: string): WorkerPool | undefined {
    return this.pools.get(name);
  }

  /**
   * Gets all pool names
   *
   * @returns Array of pool names
   */
  getPoolNames(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Gets statistics for all pools
   *
   * @returns Map of pool name to pool statistics
   */
  getAllStats(): Map<string, any> {
    const stats = new Map();

    for (const [name, pool] of this.pools) {
      stats.set(name, pool.getStats());
    }

    return stats;
  }

  /**
   * Removes a pool by name
   *
   * @param name - Pool name to remove
   * @returns True if pool was removed, false if not found
   */
  async removePool(name: string): Promise<boolean> {
    const pool = this.pools.get(name);

    if (!pool) {
      return false;
    }

    logger.info('Removing worker pool', { name });

    await pool.shutdown();
    this.pools.delete(name);

    return true;
  }

  /**
   * Shuts down all worker pools
   */
  async shutdownAll(): Promise<void> {
    logger.info('Shutting down all worker pools', {
      count: this.pools.size,
    });

    const shutdownPromises = Array.from(this.pools.values()).map(pool =>
      pool.shutdown()
    );

    await Promise.all(shutdownPromises);

    this.pools.clear();
  }

  /**
   * Gets the total number of pools
   *
   * @returns Number of active pools
   */
  get size(): number {
    return this.pools.size;
  }
}
```

**Testing:**
- Test createPool() with valid/invalid names
- Test getPool() retrieval
- Test removePool() cleanup
- Test shutdownAll() with multiple pools
- Test getAllStats() aggregation

---

#### Part 4: Update index-wasm.ts (4-6 hours)

**New Code:**
```typescript
// src/index-wasm.ts
import { AccelerationRouter, RouterConfig } from './acceleration-router.js';
import { WorkerPoolManager } from './workers/pool-manager.js';
import { getDegradationPolicy } from './degradation-policy.js';

// Optional: Create separate pools for different operation types
const poolManager = new WorkerPoolManager();

// Create router configuration
const routerConfig: RouterConfig = {
  enableWorkers: true,
  workerPoolConfig: {
    maxWorkers: parseInt(process.env.MAX_WORKERS || '8', 10),
    minWorkers: parseInt(process.env.MIN_WORKERS || '2', 10),
    workerIdleTimeout: parseInt(process.env.WORKER_IDLE_TIMEOUT || '60000', 10),
    taskTimeout: parseInt(process.env.TASK_TIMEOUT || '30000', 10),
    maxQueueSize: parseInt(process.env.MAX_QUEUE_SIZE || '1000', 10),
  },
  degradationPolicy: getDegradationPolicy(),
};

// Create router with DI
const router = new AccelerationRouter(routerConfig);

// Initialize router (creates pool if needed)
await router.initialize();

// MCP server setup
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return router.route(request);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  await router.shutdown();
  await poolManager.shutdownAll();

  process.exit(0);
});
```

**Testing:**
- Verify router initializes correctly
- Test graceful shutdown
- Verify pool is created on demand

---

#### Part 5: Add Unit Tests (12-16 hours)

**New File: test/unit/workers/pool-manager.test.ts**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerPoolManager } from '../../../src/workers/pool-manager.js';
import { WorkerPoolConfig } from '../../../src/workers/worker-types.js';

describe('WorkerPoolManager', () => {
  let manager: WorkerPoolManager;

  beforeEach(() => {
    manager = new WorkerPoolManager();
  });

  afterEach(async () => {
    await manager.shutdownAll();
  });

  describe('createPool', () => {
    it('should create a new pool', async () => {
      const config: WorkerPoolConfig = {
        maxWorkers: 2,
        minWorkers: 1,
      };

      const pool = await manager.createPool('test-pool', config);

      expect(pool).toBeDefined();
      expect(manager.size).toBe(1);
    });

    it('should throw if pool name already exists', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('test-pool', config);

      await expect(
        manager.createPool('test-pool', config)
      ).rejects.toThrow("Worker pool 'test-pool' already exists");
    });
  });

  describe('getPool', () => {
    it('should return existing pool', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };
      await manager.createPool('test-pool', config);

      const pool = manager.getPool('test-pool');

      expect(pool).toBeDefined();
    });

    it('should return undefined for non-existent pool', () => {
      const pool = manager.getPool('non-existent');

      expect(pool).toBeUndefined();
    });
  });

  describe('removePool', () => {
    it('should remove and shutdown pool', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };
      await manager.createPool('test-pool', config);

      const removed = await manager.removePool('test-pool');

      expect(removed).toBe(true);
      expect(manager.size).toBe(0);
      expect(manager.getPool('test-pool')).toBeUndefined();
    });

    it('should return false for non-existent pool', async () => {
      const removed = await manager.removePool('non-existent');

      expect(removed).toBe(false);
    });
  });

  describe('shutdownAll', () => {
    it('should shutdown all pools', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);
      await manager.createPool('pool-3', config);

      expect(manager.size).toBe(3);

      await manager.shutdownAll();

      expect(manager.size).toBe(0);
    });
  });

  describe('getAllStats', () => {
    it('should return stats for all pools', async () => {
      const config: WorkerPoolConfig = { maxWorkers: 2 };

      await manager.createPool('pool-1', config);
      await manager.createPool('pool-2', config);

      const stats = manager.getAllStats();

      expect(stats.size).toBe(2);
      expect(stats.has('pool-1')).toBe(true);
      expect(stats.has('pool-2')).toBe(true);
    });
  });
});
```

**Additional Tests:**
- Test AccelerationRouter with injected pool
- Test AccelerationRouter without injected pool
- Test multiple routers sharing same pool
- Test router.initialize() and router.shutdown()

---

#### Part 6: Integration & Verification (4-6 hours)

**Verification Checklist:**
- [ ] All unit tests pass (existing + new)
- [ ] Type checking passes (no errors)
- [ ] Integration tests pass (11 tests)
- [ ] No regressions in functionality
- [ ] Worker pool still scales correctly
- [ ] Graceful shutdown works
- [ ] Documentation updated

**Performance Verification:**
- Run benchmarks to ensure no performance regression
- Verify worker pool performance unchanged

---

## Task 20: Implement Backpressure

**Complexity:** 🟠 Complex (1-2 weeks)
**Priority:** Medium
**Current State:** Immediate rejection when queue full
**Goal:** Graceful backpressure with retry strategies

### Detailed Implementation Steps

#### Part 1: Create BackpressureQueue Class (8-12 hours)

**New File: src/workers/backpressure.ts**
```typescript
import { EventEmitter } from 'events';
import { Task, OperationType } from './worker-types.js';
import { logger } from '../shared/logger.js';

/**
 * Backpressure strategies for handling queue overflow
 */
export enum BackpressureStrategy {
  /** Reject new requests immediately with retry-after header */
  REJECT = 'REJECT',

  /** Wait for queue to drain before accepting request */
  WAIT = 'WAIT',

  /** Drop lowest priority task to make room */
  SHED = 'SHED',
}

/**
 * Configuration for backpressure queue
 */
export interface BackpressureConfig {
  /** Maximum queue size before backpressure activates */
  maxSize: number;

  /** Strategy to use when queue is full */
  strategy: BackpressureStrategy;

  /** Maximum time to wait in WAIT strategy (ms) */
  maxWaitTime?: number;

  /** Threshold for drain events (0-1, e.g., 0.2 = 20% full) */
  drainThreshold?: number;
}

/**
 * Options for enqueueing a task
 */
export interface EnqueueOptions {
  /** Task priority (higher = more important) */
  priority?: number;

  /** Maximum wait time for this specific task (ms) */
  timeout?: number;
}

/**
 * Queued task with metadata
 */
interface QueuedTask<T> {
  task: Task<T>;
  priority: number;
  enqueuedAt: number;
}

/**
 * Backpressure-aware task queue
 *
 * Implements three strategies for handling queue overflow:
 * - REJECT: Return error with retry-after suggestion
 * - WAIT: Block until queue has space
 * - SHED: Drop lowest priority task to make room
 */
export class BackpressureQueue<T> extends EventEmitter {
  private queue: Array<QueuedTask<T>> = [];
  private readonly config: Required<BackpressureConfig>;
  private taskDurations: number[] = [];
  private wasAboveThreshold = false;

  constructor(config: BackpressureConfig) {
    super();

    this.config = {
      maxSize: config.maxSize,
      strategy: config.strategy,
      maxWaitTime: config.maxWaitTime || 30000,
      drainThreshold: config.drainThreshold || 0.2,
    };
  }

  /**
   * Enqueues a task with backpressure handling
   *
   * @param task - Task to enqueue
   * @param options - Enqueue options
   * @returns Promise that resolves when task is enqueued
   * @throws BackpressureError if queue is full and strategy is REJECT
   */
  async enqueue(task: Task<T>, options: EnqueueOptions = {}): Promise<void> {
    if (this.queue.length >= this.config.maxSize) {
      return this.handleBackpressure(task, options);
    }

    this.addToQueue(task, options.priority || 0);
  }

  /**
   * Dequeues the highest priority task
   *
   * @returns The next task or null if queue is empty
   */
  dequeue(): Task<T> | null {
    if (this.queue.length === 0) {
      return null;
    }

    // Sort by priority (descending), then by enqueue time (ascending)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.enqueuedAt - b.enqueuedAt;
    });

    const queued = this.queue.shift();

    if (queued) {
      this.checkDrainThreshold();
      return queued.task;
    }

    return null;
  }

  /**
   * Gets current queue size
   */
  get size(): number {
    return this.queue.length;
  }

  /**
   * Checks if queue is full
   */
  get isFull(): boolean {
    return this.queue.length >= this.config.maxSize;
  }

  /**
   * Handles backpressure based on configured strategy
   */
  private async handleBackpressure(
    task: Task<T>,
    options: EnqueueOptions
  ): Promise<void> {
    logger.warn('Queue full, applying backpressure', {
      size: this.queue.length,
      maxSize: this.config.maxSize,
      strategy: this.config.strategy,
    });

    switch (this.config.strategy) {
      case BackpressureStrategy.REJECT:
        return this.rejectRequest(task);

      case BackpressureStrategy.WAIT:
        return this.waitForSpace(task, options);

      case BackpressureStrategy.SHED:
        return this.shedLowestPriority(task, options);
    }
  }

  /**
   * REJECT strategy: Reject request with retry suggestion
   */
  private rejectRequest(task: Task<T>): void {
    const retryAfter = this.estimateWaitTime();

    const error = new BackpressureError(
      'Queue is full, please retry later',
      {
        queueSize: this.queue.length,
        maxSize: this.config.maxSize,
        suggestedRetryAfter: retryAfter,
        strategy: BackpressureStrategy.REJECT,
      }
    );

    task.reject(error);

    this.emit('reject', {
      queueSize: this.queue.length,
      retryAfter,
    });
  }

  /**
   * WAIT strategy: Wait for queue to drain
   */
  private async waitForSpace(
    task: Task<T>,
    options: EnqueueOptions
  ): Promise<void> {
    const timeout = options.timeout || this.config.maxWaitTime;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        if (this.queue.length < this.config.maxSize) {
          clearInterval(checkInterval);
          this.addToQueue(task, options.priority || 0);
          resolve();
        } else if (elapsed >= timeout) {
          clearInterval(checkInterval);
          reject(
            new BackpressureError('Timeout waiting for queue space', {
              queueSize: this.queue.length,
              maxSize: this.config.maxSize,
              suggestedRetryAfter: this.estimateWaitTime(),
              strategy: BackpressureStrategy.WAIT,
            })
          );
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * SHED strategy: Drop lowest priority task
   */
  private shedLowestPriority(
    task: Task<T>,
    options: EnqueueOptions
  ): void {
    // Find lowest priority task
    let lowestPriorityIndex = 0;
    let lowestPriority = this.queue[0]?.priority || 0;

    for (let i = 1; i < this.queue.length; i++) {
      if (this.queue[i].priority < lowestPriority) {
        lowestPriority = this.queue[i].priority;
        lowestPriorityIndex = i;
      }
    }

    // Only shed if new task has higher priority
    const newTaskPriority = options.priority || 0;

    if (newTaskPriority > lowestPriority) {
      const dropped = this.queue.splice(lowestPriorityIndex, 1)[0];

      dropped.task.reject(
        new BackpressureError('Task dropped due to higher priority request', {
          queueSize: this.queue.length,
          maxSize: this.config.maxSize,
          suggestedRetryAfter: 0,
          strategy: BackpressureStrategy.SHED,
        })
      );

      logger.info('Dropped low priority task', {
        droppedPriority: lowestPriority,
        newPriority: newTaskPriority,
      });

      this.addToQueue(task, newTaskPriority);

      this.emit('shed', {
        droppedPriority: lowestPriority,
        newPriority: newTaskPriority,
      });
    } else {
      // New task has lower priority, reject it
      task.reject(
        new BackpressureError('Task priority too low', {
          queueSize: this.queue.length,
          maxSize: this.config.maxSize,
          suggestedRetryAfter: this.estimateWaitTime(),
          strategy: BackpressureStrategy.SHED,
        })
      );
    }
  }

  /**
   * Adds task to queue
   */
  private addToQueue(task: Task<T>, priority: number): void {
    this.queue.push({
      task,
      priority,
      enqueuedAt: Date.now(),
    });

    // Track if we're above drain threshold
    const threshold = this.config.maxSize * this.config.drainThreshold;
    if (this.queue.length > threshold) {
      this.wasAboveThreshold = true;
    }
  }

  /**
   * Checks if queue has drained below threshold
   */
  private checkDrainThreshold(): void {
    const threshold = this.config.maxSize * this.config.drainThreshold;

    if (this.wasAboveThreshold && this.queue.length <= threshold) {
      this.emit('drain', {
        queueSize: this.queue.length,
        maxSize: this.config.maxSize,
      });

      this.wasAboveThreshold = false;

      logger.info('Queue drained below threshold', {
        size: this.queue.length,
        threshold,
      });
    }
  }

  /**
   * Estimates wait time based on average task duration
   */
  private estimateWaitTime(): number {
    if (this.taskDurations.length === 0) {
      // No data, estimate based on queue size
      return this.queue.length * 100; // 100ms per task estimate
    }

    // Calculate average task duration
    const avg = this.taskDurations.reduce((a, b) => a + b, 0) / this.taskDurations.length;

    // Multiply by queue size
    return Math.ceil(avg * this.queue.length);
  }

  /**
   * Records task completion time for wait estimation
   */
  recordTaskDuration(durationMs: number): void {
    this.taskDurations.push(durationMs);

    // Keep only last 100 durations
    if (this.taskDurations.length > 100) {
      this.taskDurations.shift();
    }
  }

  /**
   * Gets queue statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    strategy: BackpressureStrategy;
    avgTaskDuration: number;
    estimatedWaitTime: number;
  } {
    const avgDuration = this.taskDurations.length > 0
      ? this.taskDurations.reduce((a, b) => a + b, 0) / this.taskDurations.length
      : 0;

    return {
      size: this.queue.length,
      maxSize: this.config.maxSize,
      strategy: this.config.strategy,
      avgTaskDuration: avgDuration,
      estimatedWaitTime: this.estimateWaitTime(),
    };
  }
}

/**
 * Error thrown when backpressure is applied
 */
export class BackpressureError extends Error {
  name = 'BackpressureError';

  constructor(
    message: string,
    public readonly metadata: {
      queueSize: number;
      maxSize: number;
      suggestedRetryAfter: number;
      strategy: BackpressureStrategy;
    }
  ) {
    super(message);
    Object.setPrototypeOf(this, BackpressureError.prototype);
  }
}
```

**Testing:**
- Test each strategy (REJECT, WAIT, SHED)
- Test priority ordering
- Test drain events
- Test wait time estimation
- Test task duration tracking

---

#### Part 2-4: Implement Each Strategy (Already in Part 1)

The three strategies are implemented in the BackpressureQueue class above.

---

#### Part 5: Add BackpressureError to errors.ts (2-3 hours)

**File: src/errors.ts**
```typescript
// Add to existing errors.ts

/**
 * Error thrown when backpressure is applied
 * Used to signal that the system is under load and requests should be retried
 */
export class BackpressureError extends MathMCPError {
  override name = 'BackpressureError';

  constructor(
    message: string,
    public readonly metadata: {
      queueSize: number;
      maxSize: number;
      suggestedRetryAfter: number;
      strategy: string;
    },
    options?: ErrorOptions
  ) {
    super(message, options);
    Object.setPrototypeOf(this, BackpressureError.prototype);
  }
}
```

---

#### Part 6: Update index-wasm.ts for 503 Responses (4-6 hours)

**File: src/index-wasm.ts**
```typescript
import { BackpressureError } from './errors.js';

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await router.route(request);
  } catch (error) {
    // Handle backpressure with 503 response
    if (error instanceof BackpressureError) {
      logger.warn('Backpressure applied', {
        metadata: error.metadata,
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Service temporarily unavailable',
            message: error.message,
            retryAfter: error.metadata.suggestedRetryAfter,
            queueStatus: {
              current: error.metadata.queueSize,
              max: error.metadata.maxSize,
            },
            strategy: error.metadata.strategy,
          }, null, 2),
        }],
        isError: true,
        _meta: {
          statusCode: 503,
          retryAfter: error.metadata.suggestedRetryAfter,
        },
      };
    }

    // Handle other errors
    throw error;
  }
});
```

**Environment Variables:**
```bash
# Backpressure configuration
BACKPRESSURE_STRATEGY=REJECT  # REJECT | WAIT | SHED
MAX_WAIT_TIME=30000           # Max wait time for WAIT strategy (ms)
DRAIN_THRESHOLD=0.2           # Drain event threshold (0-1)
```

---

#### Part 7-8: Testing (12-16 hours)

**New File: test/unit/workers/backpressure.test.ts**

Test all strategies, error handling, and integration with worker pool.

---

## Task 22: Security Testing Suite

**Complexity:** 🔴 Major (3-4 weeks)
**Priority:** High (Security)
**Current State:** Security tested in unit tests
**Goal:** Dedicated security test suite with injection/fuzzing/bounds tests

### Detailed Implementation Steps

#### Part 1: Create Directory Structure (1-2 hours)

```bash
mkdir -p test/security
```

**Directory Structure:**
```
test/
└── security/
    ├── injection-tests.ts      # Code injection prevention
    ├── dos-tests.ts            # DoS resilience
    ├── fuzzing-tests.ts        # Random input fuzzing
    ├── bounds-tests.ts         # Edge cases and limits
    └── malicious-payload-tests.ts  # Malicious inputs
```

---

#### Part 2-5: Create Test Files (20-24 hours each)

See IMPLEMENTATION_PLAN.md lines 2410-2656 for detailed test cases.

Each test file should have 50+ test cases covering:
- Injection attacks (function definitions, assignments, imports, prototype pollution)
- DoS attacks (rate limiting, timeouts, oversized inputs, concurrent requests)
- Fuzzing (1000+ random inputs)
- Bounds testing (size limits, edge case numbers)

---

#### Part 6: Add NPM Scripts (1-2 hours)

**File: package.json**
```json
{
  "scripts": {
    "test:security": "vitest run test/security",
    "test:security:watch": "vitest test/security",
    "test:security:injection": "vitest run test/security/injection-tests.ts",
    "test:security:dos": "vitest run test/security/dos-tests.ts",
    "test:security:fuzz": "vitest run test/security/fuzzing-tests.ts",
    "test:security:bounds": "vitest run test/security/bounds-tests.ts"
  }
}
```

---

#### Part 7: Verification (4-6 hours)

**Verification Checklist:**
- [ ] All security tests pass
- [ ] At least 200+ security test cases
- [ ] Fuzzing covers 1000+ random inputs
- [ ] All injection vectors blocked
- [ ] DoS protections working
- [ ] CI integration added

---

## Task 23: Telemetry & Observability

**Complexity:** 🔴 Major (4-6 weeks)
**Priority:** Medium-High (Operations)
**Current State:** Structured logging + performance tracking
**Goal:** Prometheus metrics + OpenTelemetry tracing + Grafana dashboards

### Detailed Implementation Steps

#### Part 1: Install Dependencies (1-2 hours)

```bash
npm install --save prom-client
npm install --save @opentelemetry/api \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-base \
  @opentelemetry/exporter-jaeger
```

---

#### Part 2-8: Implementation (See IMPLEMENTATION_PLAN.md lines 2682-2925)

Create:
- `src/telemetry/metrics.ts` - Prometheus metrics
- `src/telemetry/tracing.ts` - OpenTelemetry setup
- `src/health.ts` - Health check endpoint
- `src/telemetry/server.ts` - Metrics HTTP server

Instrument all tool handlers with:
- Operation duration histograms
- Operation counters
- Queue size gauges
- Worker count gauges
- Rate limit hit counters

---

#### Part 9: Grafana Dashboard (4-6 hours)

**New File: docs/grafana-dashboard.json**

Create example dashboard with:
- Request rate graph
- Operation duration histogram
- Queue size graph
- Worker pool status
- Cache hit rate
- Rate limit hits
- Error rate

---

#### Part 10: Documentation (4-6 hours)

Update README.md with:
- Prometheus metrics endpoint
- OpenTelemetry configuration
- Jaeger tracing setup
- Grafana dashboard import
- Example queries

---

## Sprint 9 Verification

### Final Checklist

**Before Sprint Completion:**
- [ ] All 4 tasks complete (19, 20, 22, 23)
- [ ] All new tests passing
- [ ] All existing tests passing (661+)
- [ ] Type checking passes
- [ ] No performance regressions
- [ ] Documentation updated
- [ ] CHANGELOG updated
- [ ] All changes committed and pushed

**Test Coverage Targets:**
- Task 19: 20+ DI tests
- Task 20: 50+ backpressure tests
- Task 22: 200+ security tests
- Task 23: 30+ telemetry tests
- **Total New Tests:** ~300+

**Documentation Updates:**
- README.md (telemetry, backpressure)
- TROUBLESHOOTING.md (backpressure errors)
- DEPLOYMENT.md (Prometheus/Grafana setup)
- CHANGELOG.md (Sprint 9 summary)

---

## Success Criteria

### Task 19: Dependency Injection
✅ Global singleton removed
✅ WorkerPoolManager supports multiple pools
✅ Router uses DI pattern
✅ All tests pass with no regressions

### Task 20: Backpressure
✅ Three strategies implemented (REJECT/WAIT/SHED)
✅ 503 responses with retry-after
✅ Queue drain events working
✅ Client retry example documented

### Task 22: Security Testing
✅ 200+ security test cases
✅ Injection attack coverage (50+)
✅ DoS resilience tests
✅ Fuzzing tests (1000+ inputs)
✅ CI integration

### Task 23: Telemetry
✅ Prometheus metrics exported
✅ OpenTelemetry tracing working
✅ Health check endpoint
✅ Grafana dashboard example
✅ Production monitoring ready

---

## Timeline Estimate

| Task | Duration | Effort |
|------|----------|--------|
| Task 19 | 2-3 weeks | 50-70 hours |
| Task 20 | 1-2 weeks | 40-50 hours |
| Task 22 | 3-4 weeks | 80-100 hours |
| Task 23 | 4-6 weeks | 100-120 hours |
| **Total** | **10-15 weeks** | **270-340 hours** |

**Note:** Tasks can be parallelized or done sequentially based on priority.

---

## Risk Mitigation

### High-Risk Areas
1. **Backpressure WAIT strategy** - May cause thread blocking
   - Mitigation: Use event-driven approach, not polling

2. **OpenTelemetry overhead** - Tracing may impact performance
   - Mitigation: Make tracing optional, benchmark before/after

3. **Security test fuzzing** - May be flaky
   - Mitigation: Use seed-based random generation

### Dependencies
- Task 20 depends on Task 19 (for queue integration)
- Task 23 should be done last (requires stable system)

---

## Conclusion

Sprint 9 completes the remaining 7% of the IMPLEMENTATION_PLAN.md, bringing the project to **100% feature complete**. These advanced features enhance production resilience, security, and observability without affecting core functionality.

**Current Status:** 93% complete (18/23 tasks)
**After Sprint 9:** 100% complete (23/23 tasks)

All features are optional enhancements that can be deployed post-production based on operational needs.
