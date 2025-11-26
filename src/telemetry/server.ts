/**
 * @file server.ts
 * @description HTTP server for telemetry endpoints (metrics and health)
 *
 * Provides:
 * - GET /metrics - Prometheus metrics endpoint
 * - GET /health - Health check endpoint
 * - GET /health/live - Liveness probe
 * - GET /health/ready - Readiness probe
 *
 * Runs on port 9090 by default (configurable via TELEMETRY_PORT env var)
 *
 * @module telemetry/server
 * @since 3.2.0
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { logger } from '../utils.js';
import { getMetrics } from './metrics.js';
import {
  getHealthStatus,
  getLiveness,
  getReadiness,
} from '../health.js';

/**
 * Telemetry server configuration.
 */
export interface TelemetryServerConfig {
  /** Port to listen on (default: 9090) */
  port?: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** Enable CORS (default: true) */
  enableCors?: boolean;
}

/**
 * Telemetry HTTP server.
 */
export class TelemetryServer {
  private server: ReturnType<typeof createServer> | null = null;
  private readonly config: Required<TelemetryServerConfig>;

  constructor(config: TelemetryServerConfig = {}) {
    this.config = {
      port: config.port || parseInt(process.env.TELEMETRY_PORT || '9090', 10),
      host: config.host || '0.0.0.0',
      enableCors: config.enableCors !== false,
    };
  }

  /**
   * Start the telemetry server.
   *
   * @returns Promise that resolves when server is listening
   */
  async start(): Promise<void> {
    if (this.server) {
      logger.warn('Telemetry server already running');
      return;
    }

    this.server = createServer(this.handleRequest.bind(this));

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error('Server not initialized'));
        return;
      }

      this.server.once('error', reject);

      this.server.listen(this.config.port, this.config.host, () => {
        logger.info('Telemetry server started', {
          port: this.config.port,
          host: this.config.host,
        });
        resolve();
      });
    });
  }

  /**
   * Stop the telemetry server.
   *
   * @returns Promise that resolves when server is stopped
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          reject(error);
        } else {
          logger.info('Telemetry server stopped');
          this.server = null;
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests.
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = req.url || '/';

    // Add CORS headers if enabled
    if (this.config.enableCors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
    }

    // Route requests
    try {
      if (req.method !== 'GET') {
        this.send405(res);
        return;
      }

      if (url === '/metrics') {
        await this.handleMetrics(req, res);
      } else if (url === '/health') {
        await this.handleHealth(req, res);
      } else if (url === '/health/live') {
        await this.handleLiveness(req, res);
      } else if (url === '/health/ready') {
        await this.handleReadiness(req, res);
      } else if (url === '/' || url === '') {
        this.handleRoot(req, res);
      } else {
        this.send404(res);
      }
    } catch (error: unknown) {
      logger.error('Error handling telemetry request', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.send500(res, error);
    }
  }

  /**
   * Handle GET /metrics
   */
  private async handleMetrics(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const metrics = await getMetrics();

    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.writeHead(200);
    res.end(metrics);

    logger.debug('Served metrics endpoint');
  }

  /**
   * Handle GET /health
   */
  private async handleHealth(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const health = await getHealthStatus();

    const statusCode = health.status === 'unhealthy' ? 503 : 200;

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify(health, null, 2));

    logger.debug('Served health endpoint', { status: health.status });
  }

  /**
   * Handle GET /health/live
   */
  private async handleLiveness(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const live = getLiveness();

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ live }, null, 2));

    logger.debug('Served liveness endpoint');
  }

  /**
   * Handle GET /health/ready
   */
  private async handleReadiness(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const ready = await getReadiness();

    const statusCode = ready ? 200 : 503;

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
    res.end(JSON.stringify({ ready }, null, 2));

    logger.debug('Served readiness endpoint', { ready });
  }

  /**
   * Handle GET /
   */
  private handleRoot(req: IncomingMessage, res: ServerResponse): void {
    const info = {
      service: 'math-mcp telemetry',
      version: process.env.npm_package_version || '0.0.0',
      endpoints: {
        metrics: '/metrics',
        health: '/health',
        liveness: '/health/live',
        readiness: '/health/ready',
      },
    };

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(info, null, 2));
  }

  /**
   * Send 404 Not Found
   */
  private send404(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }, null, 2));
  }

  /**
   * Send 405 Method Not Allowed
   */
  private send405(res: ServerResponse): void {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Allow', 'GET, OPTIONS');
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method Not Allowed' }, null, 2));
  }

  /**
   * Send 500 Internal Server Error
   */
  private send500(res: ServerResponse, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';

    res.setHeader('Content-Type', 'application/json');
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal Server Error', message }, null, 2));
  }
}

/**
 * Global telemetry server instance.
 *
 * Can be started/stopped via environment variable ENABLE_TELEMETRY=true
 */
let globalTelemetryServer: TelemetryServer | null = null;

/**
 * Start the global telemetry server if enabled.
 *
 * Controlled by ENABLE_TELEMETRY environment variable.
 *
 * @returns Promise that resolves when server is started (or immediately if disabled)
 */
export async function startTelemetryServer(): Promise<void> {
  const enabled = process.env.ENABLE_TELEMETRY === 'true';

  if (!enabled) {
    logger.info('Telemetry server disabled (set ENABLE_TELEMETRY=true to enable)');
    return;
  }

  if (globalTelemetryServer) {
    logger.warn('Telemetry server already started');
    return;
  }

  globalTelemetryServer = new TelemetryServer();
  await globalTelemetryServer.start();
}

/**
 * Stop the global telemetry server.
 *
 * @returns Promise that resolves when server is stopped
 */
export async function stopTelemetryServer(): Promise<void> {
  if (!globalTelemetryServer) {
    return;
  }

  await globalTelemetryServer.stop();
  globalTelemetryServer = null;
}

/**
 * Get the global telemetry server instance.
 *
 * @returns Telemetry server instance or null if not started
 */
export function getTelemetryServer(): TelemetryServer | null {
  return globalTelemetryServer;
}
