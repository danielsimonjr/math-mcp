#!/usr/bin/env node

/**
 * @file index.ts
 * @description Math MCP Server
 *
 * This is the main entry point for the Math MCP Server (entry `src/index.ts`,
 * compiled to `dist/index.js`, also the package `bin`). It provides 7
 * mathematical tools backed by the MathTS (mathjs-compatible) engine.
 *
 * **Tools:**
 * 1. evaluate - Evaluate mathematical expressions with variables
 * 2. simplify - Simplify algebraic expressions
 * 3. derivative - Calculate derivatives
 * 4. solve - Solve equations
 * 5. matrix_operations - Matrix operations
 * 6. statistics - Statistical calculations
 * 7. unit_conversion - Convert between units
 *
 * **Protocol:** Implements MCP 2026-07-28 (MCP 2.0) via `@modelcontextprotocol/server`
 * v2, with backward-compatible stdio serving for 2025-era clients.
 *
 * @module index
 * @since 2.0.0
 */

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { startTelemetryServer, stopTelemetryServer } from "./telemetry/server.js";
import { registerMathTools } from "./register-tools.js";
import { logger, getPackageVersion, perfTracker } from "./utils.js";

const TOOL_COUNT = 7;

/** Cache TTL for static tool catalog and discovery responses (MCP 2026-07-28). */
const TOOLS_LIST_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Creates a configured MCP server instance for the current connection.
 *
 * The factory is invoked by {@link serveStdio} once per client connection so
 * the same registration code serves both the modern (2026-07-28) and legacy
 * (2025-11-25 initialize handshake) stdio eras.
 */
function createMathMcpServer(version: string): McpServer {
  const server = new McpServer(
    {
      name: "math-mcp",
      version,
    },
    {
      capabilities: {
        tools: {},
      },
      cacheHints: {
        "tools/list": { ttlMs: TOOLS_LIST_CACHE_TTL_MS, cacheScope: "private" },
        "server/discover": { ttlMs: TOOLS_LIST_CACHE_TTL_MS, cacheScope: "private" },
      },
    }
  );

  registerMathTools(server);
  return server;
}

/**
 * Logs performance statistics to the console.
 * Called periodically to monitor server performance.
 */
function logPerformanceStats(): void {
  const toolStats = perfTracker.getAllStats();

  logger.info("Performance stats", {
    topOperations: Array.from(toolStats.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([op, stats]) => ({
        operation: op,
        count: stats.count,
        avgTime: stats.avgTime.toFixed(3) + "ms",
      })),
  });
}

/**
 * Main server startup function.
 */
async function main(): Promise<void> {
  try {
    const version = await getPackageVersion();

    const handle = serveStdio(() => createMathMcpServer(version), {
      // Default `legacy: 'serve'` keeps 2025-era initialize clients working.
    });

    await startTelemetryServer();

    const shutdown = async (): Promise<void> => {
      await stopTelemetryServer();
      await handle.close();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    logger.info("MathTS MCP Server running", {
      version,
      transport: "stdio",
      protocol: "2026-07-28 (MCP 2.0) with 2025-era stdio fallback",
      tools: TOOL_COUNT,
    });

    if (process.env.ENABLE_PERF_LOGGING === "true") {
      setInterval(logPerformanceStats, 5 * 60 * 1000);
    }
  } catch (error) {
    logger.error("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error in main()", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
