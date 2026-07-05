# Math-MCP Product Specification

## Product Overview

**Name:** math-mcp
**Type:** Model Context Protocol (MCP) Server
**Version:** 4.1.3
**Status:** Production Ready ✅

Math-MCP is a mathematical computation server that provides mathematical
operations to Large Language Models through the Model Context Protocol. It
offers seamless integration with Claude Desktop and Claude CLI.

## Core Architecture

### Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Protocol Layer                       │
│  (src/index.ts → dist/index.js)                              │
│  - Request handling (JSON-RPC 2.0)                          │
│  - Tool registration & dispatch (7 tool definitions)          │
│  - Response formatting                                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                Tool Handler Layer                             │
│  (src/tool-handlers.ts)                                       │
│  - Input validation (src/validation.ts)                       │
│  - Rate limiting (src/rate-limiter.ts)                         │
│  - Expression caching (src/expression-cache.ts)                │
│  - Result formatting                                           │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                 MathTS Compute Engine                         │
│  (src/math-engine.ts)                                          │
│  - @danielsimonjr/mathts-compat `create(all)` instance          │
│  - mathjs-compatible expression/matrix/statistics API           │
└──────────────────────────────────────────────────────────────┘
```

### Design Philosophy

**MathTS as the compute engine:**
As of v4.0.0, the server computes via **MathTS** (`@danielsimonjr/mathts-*`),
a TypeScript engine that exposes a mathjs-compatible API — it is not a fork
or wrapper around mathjs, and it is not itself referred to as "mathjs." The
hand-built acceleration stack from earlier versions (WASM/AssemblyScript,
WebWorkers, WebGPU, a routing/adapter layer with automatic tiered fallback)
was removed in the v4 cutover; MathTS does not use any of that machinery, and
large-input protection is handled by size limits (see Security, below)
rather than a fallback chain or timeouts, since synchronous JavaScript
execution cannot be interrupted mid-computation.

## Product Features

### 7 Mathematical Tools

#### 1. **evaluate** - Expression Evaluation
- **Purpose:** Evaluate mathematical expressions with variables
- **Examples:**
  - `2 + 2` → `4`
  - `sqrt(144)` → `12`
  - `pi * 5^2` → `78.54`
- **Input:** Expression string, optional scope object
- **Output:** Computed result (formatted)

#### 2. **simplify** - Algebraic Simplification
- **Purpose:** Simplify algebraic expressions symbolically
- **Examples:**
  - `2 * x + x` → `3 * x`
  - `(x + 2)^2` → `x^2 + 4*x + 4`
- **Input:** Expression string, optional rules array
- **Output:** Simplified expression string

#### 3. **derivative** - Calculus Derivatives
- **Purpose:** Calculate symbolic derivatives
- **Examples:**
  - `derivative('x^2', 'x')` → `2*x`
  - `derivative('sin(x)', 'x')` → `cos(x)`
- **Input:** Expression string, variable name
- **Output:** Derivative expression string

#### 4. **solve** - Equation Solving
- **Purpose:** Solve equations for a variable
- **Behavior:** Exact roots, including complex roots, for polynomials of
  degree ≤ 3; a numeric real-root-only fallback is used for degree ≥ 4 and
  transcendental equations.
- **Examples:**
  - `solve('x^2 - 4 = 0', 'x')` → Exact roots
  - `solve('2x + 1 = 5', 'x')` → `x = 2`
- **Input:** Equation string, variable name
- **Output:** Root(s) of the equation

#### 5. **matrix_operations** - Matrix Operations
- **Purpose:** Matrix computations
- **Operations:** `multiply`, `inverse`, `determinant`, `transpose`,
  `eigenvalues`, `add`, `subtract`
- **Input:** Operation name, `matrix_a` as a JSON string (e.g.
  `"[[1,2],[3,4]]"`), optional `matrix_b` as a JSON string
- **Output:** Computed matrix or scalar result

#### 6. **statistics** - Statistical Analysis
- **Purpose:** Statistical computations
- **Operations:** `mean`, `median`, `mode`, `std`, `variance`, `min`, `max`,
  `sum`, `product`
- **Input:** Operation name, `data` as a JSON string (e.g. `"[1,2,3]"`)
- **Output:** Computed statistical value. Note: `mode` returns an array
  (there can be more than one most-frequent value).

#### 7. **unit_conversion** - Unit Conversions
- **Purpose:** Convert between measurement units
- **Examples:**
  - `('5 inches', 'cm')` → `12.7 cm`
  - `('100 fahrenheit', 'celsius')` → `37.78 celsius`
  - `('50 mi/h', 'km/h')` → `80.47 km/h`
- **Input:** Value with unit string, target unit string
- **Output:** Converted value with unit
- **Notes:**
  - Use compound speed forms `mi/h` / `km/h` — shorthands like `mph`, `kph`,
    and `knot` are not valid units.
  - Some astronomical/nautical/typography units (e.g. `lightyear`, `parsec`,
    `AU`, `nauticalMile`) are not available in MathTS's unit set and return
    `Unit "X" not found.`

## Technical Implementation

### Project Structure

```
math-mcp/
├── src/                          # TypeScript source
│   ├── index.ts                  # MCP server entry point + 7 tool definitions
│   ├── math-engine.ts            # MathTS instance (create(all))
│   ├── tool-handlers.ts          # Business logic for all 7 tools
│   ├── handler-utils.ts          # Shared handler helpers
│   ├── utils.ts                  # General utilities
│   ├── validation.ts             # Input validation, sandboxing, size limits
│   ├── rate-limiter.ts           # Token bucket rate limiting
│   ├── expression-cache.ts       # LRU cache for parsed/evaluated expressions
│   ├── health.ts                 # Health check system
│   ├── errors.ts                 # Error types
│   ├── types.ts                  # Shared TypeScript types
│   ├── shared/                   # constants.ts, logger.ts
│   └── telemetry/                # metrics.ts, server.ts (Prometheus + health)
│
├── dist/                         # Compiled JavaScript (tsc output)
│   └── index.js                  # Entry point / bin
│
├── test/                         # Tests
│   ├── integration-test.js       # End-to-end MCP integration tests
│   ├── correctness-tests.js      # Mathematical correctness validation
│   ├── unit/                     # Vitest unit tests
│   └── security/                 # Vitest security tests (injection, DoS, fuzzing, bounds)
│
├── docs/                         # Documentation
├── CHANGELOG.md                  # Complete project history
├── README.md                     # Main documentation
├── eslint.config.js              # ESLint flat config
├── package.json                  # Dependencies & scripts
└── tsconfig.json                 # TypeScript configuration
```

### Dependencies

**Production:**
- `@danielsimonjr/mathts-compat` - MathTS mathjs-compatible engine (`create(all)`)
- `@danielsimonjr/mathts-matrix` - MathTS matrix operations
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `prom-client` - Prometheus metrics

**Development:**
- `typescript` - TypeScript compiler
- `vitest` / `@vitest/coverage-v8` - Unit/security test runner and coverage
- `eslint` / `prettier` - Linting and formatting
- `@types/node` - Node.js type definitions

### Build Process

**Standard build (the only build step):**
```bash
npm run build
# Compiles: src/*.ts -> dist/*.js (tsc)
```

**Install dependencies:**
```bash
npm install
```

**Entry Point:**
- Main: `dist/index.js`
- Binary: `math-mcp` (via `bin` in package.json)

## MCP Protocol Implementation

### JSON-RPC 2.0 Interface

**Server Information:**
- Name: `math-mcp`
- Protocol: Model Context Protocol

**Supported Methods:**
- `tools/list` - List available tools
- `tools/call` - Execute a tool

**Request Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "matrix_operations",
    "arguments": {
      "operation": "determinant",
      "matrix_a": "[[1,2],[3,4]]"
    }
  }
}
```

**Response Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"result\": \"-2\"}"
      }
    ]
  }
}
```

**Error Handling:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"error\": \"Error message\"}"
      }
    ],
    "isError": true
  }
}
```

### Transport

**Protocol:** Standard I/O (stdio)
- Input: stdin (JSON-RPC requests)
- Output: stdout (JSON-RPC responses)
- Logging: stderr (status messages, errors)

**Initialization:**
```javascript
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Integration Points

### Claude Desktop

**Configuration File:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "math-mcp": {
      "command": "node",
      "args": ["/path/to/math-mcp/dist/index.js"]
    }
  }
}
```

### Claude CLI

**Setup:**
```bash
claude mcp add --transport stdio math-mcp node /path/to/math-mcp/dist/index.js
```

**Verification:**
```bash
claude mcp list
# Output: math-mcp: node /path/to/math-mcp/dist/index.js - ✓ Connected
```

### Other MCP Clients

Any MCP-compatible client can integrate by:
1. Spawning Node.js process: `node /path/to/dist/index.js`
2. Communicating via stdio with JSON-RPC 2.0
3. Using standard MCP protocol for tool discovery and execution

## Security

- **Expression sandboxing / AST validation** (`src/validation.ts`) — rejects
  disallowed constructs before evaluation.
- **Size limits** (`src/validation.ts`) — bound expression length, nesting
  depth, matrix dimensions, and array length; this is the primary defense
  against large/expensive inputs, since synchronous computation cannot be
  aborted mid-flight with a timeout.
- **Token-bucket rate limiting** (`src/rate-limiter.ts`).

## Quality Assurance

### Testing Strategy

**1. Integration Tests** (`test/integration-test.js`, run via `npm test`):
End-to-end correctness checks against the MathTS-backed compute engine across
small and large inputs for each operation the tools expose.

**2. Unit Tests** (`test/unit/`, run via `npm run test:unit`, Vitest):
Covers validation, expression caching, rate limiting, handler utilities,
health checks, general utilities, error types, and the solver.

**3. Security Tests** (`test/security/`, run via `npm run test:security`,
Vitest): injection, DoS/bounds, and fuzzing coverage.

**4. Correctness Tests** (`test/correctness-tests.js`, run via
`npm run test:correctness`): mathematical correctness validation.

**5. MCP Protocol Tests:**
- Request/response format validation
- Error handling verification
- All 7 tools functional testing

## Performance Monitoring

### Prometheus Metrics & Health Probes

`src/telemetry/metrics.ts` and `src/telemetry/server.ts` run an HTTP server on
**port 9090** exposing:
- `/metrics` - Prometheus metrics
- `/health` - General health status
- `/health/live` - Liveness probe
- `/health/ready` - Readiness probe

These are Kubernetes-compatible probes (`src/health.ts`).

### Logging

Controlled by `LOG_LEVEL` (`src/shared/logger.ts`) and `ENABLE_PERF_LOGGING`
for per-call performance logging (`src/index.ts`).

## Deployment Requirements

### System Requirements

**Node.js:**
- Version: 18.0.0 or higher
- Required for: JavaScript runtime

**Operating Systems:**
- Windows 10/11
- macOS
- Linux

### Installation Requirements

**Required:**
- Node.js and npm installed
- Write access to installation directory
- Network access for `npm install`

**Optional:**
- Global npm link capability (for binary installation)
- Claude Desktop or Claude CLI

## Environment Variables

The following are read from `process.env` by `src/`:
- `LOG_LEVEL` - `debug` | `info` | `warn` | `error` (`src/shared/logger.ts`)
- `NODE_ENV` (`src/shared/logger.ts`)
- `ENABLE_PERF_LOGGING` - per-call perf logging (default off, `src/index.ts`)
- `DISABLE_PERF_TRACKING` (`src/shared/constants.ts`)
- `OPERATION_TIMEOUT` - default 30000 (`src/shared/constants.ts`)
- `EXPRESSION_CACHE_SIZE` - default 1000 (`src/expression-cache.ts`)
- `MAX_REQUESTS_PER_WINDOW` - default 100 (`src/rate-limiter.ts`)
- `RATE_LIMIT_WINDOW_MS` - default 60000 (`src/rate-limiter.ts`)
- `MAX_CONCURRENT_REQUESTS` - default 10 (`src/rate-limiter.ts`)
- `MAX_QUEUE_SIZE` - default 50 (`src/rate-limiter.ts`)
- `ENABLE_TELEMETRY` - start the metrics/health HTTP server (default off, `src/telemetry/server.ts`)
- `TELEMETRY_PORT` - default 9090 (`src/telemetry/server.ts`)

### Size limits (fixed constants, NOT env-configurable)

The input size limits are hardcoded in the `LIMITS` object in
`src/validation.ts` and cannot be overridden via environment variables:
- Matrix dimension: 1000 × 1000 (`MAX_MATRIX_SIZE`)
- Array length: 100000 (`MAX_ARRAY_LENGTH`)
- Expression length: 10000 characters (`MAX_EXPRESSION_LENGTH`)
- Nesting depth: 50 (`MAX_NESTING_DEPTH`)

## Product Roadmap

### Current Status (4.1.x)

✅ All 7 tools implemented and tested on the MathTS engine
✅ Integration with Claude Desktop and CLI

### Potential Future Enhancements

**Feature Additions:**
- Symbolic integration (currently only derivatives)
- Linear programming solver
- Complex number operations
- Vector calculus operations

**Developer Experience:**
- Interactive configuration UI
- Performance profiling dashboard
- Real-time operation monitoring

**Integration:**
- Support for more MCP clients
- Streaming results for long computations
- Distributed computation support

## Support and Maintenance

### Build Commands

```bash
# Standard build
npm run build

# Development mode
npm run dev

# Start production server
npm start

# Run integration tests
npm test

# Run all tests
npm run test:all
```

### Troubleshooting

**Common Issues:**

1. **Integration test failures**
   - Rebuild project: `npm run build`
   - Check Node.js version: `node --version`
   - Review test output for specific failures

2. **MCP connection issues**
   - Verify `dist/index.js` exists (run `npm run build`)
   - Check the client configuration points at the correct absolute path

### Support Channels

**Documentation:**
- `README.md` - Quick start guide
- `CHANGELOG.md` - Complete project history
- This file - Complete product specification

**Diagnostic Commands:**
```bash
# Verify installation
node dist/index.js
# Should start and wait for JSON-RPC input

# Run tests
npm test

# Check MCP integration
claude mcp list
# Should show math-mcp as connected
```

## License and Attribution

**License:** ISC License

**Dependencies:**
- `@danielsimonjr/mathts-compat`, `@danielsimonjr/mathts-matrix` — MathTS engine
- `@modelcontextprotocol/sdk` (MIT)
- `prom-client`
- TypeScript

---

**Product Status:** Production Ready ✅
**Deployment Status:** Claude Desktop ✅ | Claude CLI ✅
