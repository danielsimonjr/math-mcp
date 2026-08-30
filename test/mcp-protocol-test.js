/**
 * @file mcp-protocol-test.js
 * @description Smoke tests for MCP protocol wiring (legacy initialize + tool call).
 */

import { spawn } from "node:child_process";
import { once } from "node:events";

const SERVER = ["node", "dist/index.js"];

function send(proc, message) {
  proc.stdin.write(JSON.stringify(message) + "\n");
}

async function readResponse(proc, id, timeoutMs = 10_000) {
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      once(proc.stdout, "data").then(([data]) => data.toString()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out waiting for response id=${id}`)), 500)
      ),
    ]).catch(() => null);

    if (chunk) buffer += chunk;

    for (const line of buffer.split("\n")) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id === id) return msg;
      } catch {
        // keep buffering partial JSON lines
      }
    }
  }

  throw new Error(`No JSON-RPC response with id=${id}. Buffer: ${buffer.slice(0, 500)}`);
}

async function runLegacyHandshake() {
  const proc = spawn(SERVER[0], SERVER.slice(1), { stdio: ["pipe", "pipe", "pipe"] });

  try {
    send(proc, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "mcp-protocol-test", version: "1.0.0" },
      },
    });

    const init = await readResponse(proc, 1);
    if (init.error) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
    if (!init.result?.capabilities?.tools) {
      throw new Error("initialize result missing tools capability");
    }

    send(proc, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });

    send(proc, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });

    const listed = await readResponse(proc, 2);
    if (listed.error) throw new Error(`tools/list failed: ${JSON.stringify(listed.error)}`);
    const names = (listed.result?.tools ?? []).map((t) => t.name).sort();
    const expected = [
      "derivative",
      "evaluate",
      "matrix_operations",
      "simplify",
      "solve",
      "statistics",
      "unit_conversion",
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`Unexpected tools: ${JSON.stringify(names)}`);
    }

    send(proc, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "evaluate", arguments: { expression: "2 + 2" } },
    });

    const called = await readResponse(proc, 3);
    if (called.error) throw new Error(`tools/call failed: ${JSON.stringify(called.error)}`);
    const text = called.result?.content?.[0]?.text ?? "";
    if (!text.includes("4")) {
      throw new Error(`evaluate(2+2) unexpected body: ${text}`);
    }

    console.log("✓ legacy initialize + tools/list + tools/call");
  } finally {
    proc.kill("SIGTERM");
  }
}

console.log("=== MCP Protocol Smoke Tests ===\n");
await runLegacyHandshake();
console.log("\nAll MCP protocol smoke tests passed.");
