# Math MCP Server

[![CI](https://github.com/danielsimonjr/math-mcp/workflows/CI/badge.svg)](https://github.com/danielsimonjr/math-mcp/actions)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/bun-%3E%3D1.4.0-f9f1e1)](https://bun.sh/)

A secure, production-ready MCP (Model Context Protocol) server exposing seven
mathematical tools — expression evaluation, symbolic calculus (derivative,
simplify), equation solving, matrix algebra, statistics, and unit conversion.

Computation is powered by **[MathTS](https://www.npmjs.com/package/@danielsimonjr/mathts-compat)**
(`@danielsimonjr/mathts-*`), a TypeScript computer-algebra engine with a
**mathjs-compatible** API. The server layers input validation, expression
sandboxing, rate limiting, and Prometheus/health observability on top of it.

> **Engine note (v4):** As of v4.0.0 the compute engine is MathTS, not mathjs.
> The tool I/O contracts are unchanged; only the internals differ. The earlier
> multi-tier acceleration stack (WASM / WebWorkers / WebGPU) was removed in the
> v4 cutover — MathTS handles its own internal dispatch, and large-input safety
> is enforced by size limits rather than a fallback chain. See
> [CHANGELOG.md](CHANGELOG.md).

## Companion skill

The plugin also ships a `math` skill (`math-mcp:math`, `/math`) — a playbook
that steers Claude to offload computation to these tools instead of doing
mental math, with composed workflows for solving, calculus, matrices,
statistics, and units. See [skills/math/SKILL.md](skills/math/SKILL.md).

## ✨ Features

### 7 mathematical tools
1. **evaluate** — evaluate expressions, with optional variables (`scope`)
2. **simplify** — symbolic simplification of algebraic expressions
3. **derivative** — symbolic differentiation
4. **solve** — solve equations for a variable
5. **matrix_operations** — multiply, inverse, determinant, transpose, eigenvalues, add, subtract
6. **statistics** — mean, median, mode, std, variance, min, max, sum, product
7. **unit_conversion** — convert a value between units

### Security
- **Expression sandboxing:** AST validation blocks code injection, dangerous functions, and assignments (`src/validation.ts`).
- **Input & size limits:** length, nesting-depth, matrix-dimension, and array-length caps prevent resource exhaustion. Oversized inputs are rejected up front (synchronous JS can't be interrupted, so protection is by **size limit**, not timeout).
- **Rate limiting:** token-bucket limiter with configurable per-window, concurrency, and queue limits (`src/rate-limiter.ts`).

### Performance & reliability
- **Expression cache:** LRU cache for parsed/evaluated expressions (`src/expression-cache.ts`).
- **Observability (optional):** set `ENABLE_TELEMETRY=true` to start an HTTP endpoint (default port 9090, `src/telemetry/`) exposing Prometheus metrics and Kubernetes-style health probes: `GET /metrics`, `GET /health`, `GET /health/live`, `GET /health/ready`.

### Example usage
```javascript
// Matrix operations — matrices are JSON strings
matrix_operations("determinant", "[[1,2],[3,4]]")                 // -2
matrix_operations("multiply", "[[1,2],[3,4]]", "[[5,6],[7,8]]")   // [[19,22],[43,50]]

// Statistics — data is a JSON string; mode returns an array
statistics("mean", "[1,2,3,4,5]")   // 3
statistics("mode", "[1,2,2,3,4]")   // [2]

// Symbolic math
derivative("x^2", "x")   // "2 * x"
simplify("2 * x + x")    // "3 * x"

// Unit conversion (use compound forms like mi/h — not mph)
unit_conversion("5 inches", "cm")   // "12.7 cm"
```

## 📦 Installation

### Requirements
- **Bun** ≥ 1.4.0 — install/script toolchain (`bun.lock` is authoritative)
- **Node.js** ≥ 22.0.0 — shipped MCP runtime (`node dist/index.js`)
- **Platform:** Windows, macOS, or Linux

### Quick start
```bash
git clone https://github.com/danielsimonjr/math-mcp.git
cd math-mcp
bun install
bun run build      # tsc — the only build step
bun run test       # integration tests
```

### Verify installation
```bash
bun --version      # v1.4.0 or higher
node --version     # v22.0.0 or higher
bun run type-check # completes without errors
bun run test       # integration tests pass
```

### Integration with Claude Desktop
Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`
on Windows; `~/Library/Application Support/Claude/claude_desktop_config.json` on
macOS; `~/.config/Claude/claude_desktop_config.json` on Linux):

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

### Integration with Claude CLI
```bash
claude mcp add --transport stdio math-mcp node /path/to/math-mcp/dist/index.js
```

## 🧮 Tools documentation

### 1. evaluate
Evaluate a mathematical expression, optionally with variables.
- `expression` (string) — the expression
- `scope` (object, optional) — variable values, e.g. `{x: 5}`
```javascript
evaluate("2 + 2")                // 4
evaluate("sqrt(16)")             // 4
evaluate("x^2 + 2*x", {x: 5})    // 35
evaluate("derivative(x^2, x)")   // "2 * x"
```

### 2. simplify
Simplify an expression.
- `expression` (string)
```javascript
simplify("2 * x + x")   // "3 * x"
simplify("(x + 2)^2")   // "x^2 + 4*x + 4"
```

### 3. derivative
Differentiate symbolically.
- `expression` (string), `variable` (string)
```javascript
derivative("x^2", "x")     // "2 * x"
derivative("sin(x)", "x")  // "cos(x)"
```

### 4. solve
Solve an equation for a variable. Returns **exact roots (including complex) for
polynomials of degree ≤ 3**; for **degree ≥ 4 or transcendental** equations it
falls back to **numeric, real roots only**.
- `equation` (string), `variable` (string)
```javascript
solve("x^2 - 4 = 0", "x")   // roots of x
solve("2*x + 3 = 7", "x")   // x = 2
```

### 5. matrix_operations
Matrix algebra. Matrices are passed as **JSON strings**.
- `operation` (string) — `multiply`, `inverse`, `determinant`, `transpose`, `eigenvalues`, `add`, `subtract`
- `matrix_a` (string) — e.g. `"[[1,2],[3,4]]"`
- `matrix_b` (string, optional) — for binary operations
```javascript
matrix_operations("determinant", "[[1,2],[3,4]]")                  // -2
matrix_operations("multiply", "[[1,2],[3,4]]", "[[5,6],[7,8]]")    // [[19,22],[43,50]]
matrix_operations("transpose", "[[1,2,3],[4,5,6]]")                // [[1,4],[2,5],[3,6]]
```

### 6. statistics
Dataset statistics. Data is passed as a **JSON string**. Note: `mode` returns an
**array** (single mode `[value]`, multiple modes `[v1, v2]`).
- `operation` (string) — `mean`, `median`, `mode`, `std`, `variance`, `min`, `max`, `sum`, `product`
- `data` (string) — e.g. `"[1,2,3,4,5]"`
```javascript
statistics("mean", "[1,2,3,4,5]")          // 3
statistics("std", "[2,4,4,4,5,5,7,9]")      // 2
statistics("mode", "[1,2,2,3,4,4,4,5]")     // [4]
```

### 7. unit_conversion
Convert a value between units.
- `value` (string) — value with unit, e.g. `"5 inches"`
- `target_unit` (string) — e.g. `"cm"`

Use compound forms for speeds (`mi/h`, `km/h`, `m/s`); the shorthands `mph` /
`kph` / `knot` are not recognized units. Some astronomical/nautical units
(`lightyear`, `parsec`, `AU`, `nauticalMile`, …) are not in the unit set.
```javascript
unit_conversion("5 inches", "cm")             // "12.7 cm"
unit_conversion("100 fahrenheit", "celsius")  // "37.78 celsius"
unit_conversion("50 mi/h", "km/h")            // "80.47 km/h"
```

## 🏗️ Architecture

```
MCP client (stdio)
      ↓
src/index.ts — MCP server + 7 tool definitions  (→ dist/index.js, the bin)
      ↓
src/tool-handlers.ts — validate → compute → format, per tool
      ↓
src/math-engine.ts — MathTS instance (create(all), mathjs-compatible)
```

- **Compute:** MathTS (`@danielsimonjr/mathts-compat`, `@danielsimonjr/mathts-matrix`). No acceleration router / WASM / worker / GPU tier — those were removed in v4; MathTS does its own internal dispatch.
- **Safety:** input validation and size limits (`src/validation.ts`), token-bucket rate limiting (`src/rate-limiter.ts`), expression cache (`src/expression-cache.ts`).
- **Observability:** Prometheus metrics + health probes on port 9090 (`src/telemetry/`).

### Project structure
```
math-mcp/
├── src/
│   ├── index.ts            # MCP server + 7 tool definitions (→ dist/index.js, bin)
│   ├── math-engine.ts      # Builds the MathTS instance (create(all))
│   ├── tool-handlers.ts    # Business logic for the 7 tools
│   ├── handler-utils.ts    # Shared handler helpers
│   ├── validation.ts       # Input validation, sandboxing, size limits
│   ├── rate-limiter.ts     # Token-bucket rate limiting
│   ├── expression-cache.ts # LRU cache for parsed/evaluated expressions
│   ├── health.ts           # Health-check system
│   ├── errors.ts / types.ts
│   ├── shared/             # constants.ts, logger.ts
│   └── telemetry/          # metrics.ts (Prometheus), server.ts (HTTP :9090)
├── test/
│   ├── integration-test.js # Integration tests
│   ├── correctness-tests.js
│   ├── unit/               # Vitest unit tests
│   └── security/           # Security tests (injection, DoS, fuzzing, bounds)
├── dist/                   # Compiled JavaScript (dist/index.js is the entry)
├── skills/math/            # Companion `math` skill (math-mcp:math, /math)
├── docs/                   # Documentation
├── CHANGELOG.md · CONTRIBUTING.md · SECURITY.md · LICENSE · package.json
```

## 🧪 Development

Bun is the TypeScript-on-Bun toolchain; Node runs the shipped server.

```bash
bun run build         # tsc
bun start             # node dist/index.js
bun run dev           # tsc && node dist/index.js

bun run test          # integration tests
bun run test:correctness
bun run test:unit     # Vitest
bun run test:security # Vitest security suite
bun run test:coverage

bun run type-check    # tsc --noEmit
bun run lint          # ESLint
bun run lint:fix
bun run format        # Prettier
bun run format:check
```

## 🔧 Configuration

Environment variables read by the server:

```bash
# Logging
LOG_LEVEL=debug|info|warn|error   # verbosity (default: debug; info when NODE_ENV=production)
ENABLE_PERF_LOGGING=true          # per-call performance logging (default: off)
DISABLE_PERF_TRACKING=true        # disable internal perf tracking (default: tracking on)

# Rate limiting
MAX_REQUESTS_PER_WINDOW=100       # requests per window (default: 100)
RATE_LIMIT_WINDOW_MS=60000        # window length, ms (default: 60000)
MAX_CONCURRENT_REQUESTS=10        # max in-flight operations (default: 10)
MAX_QUEUE_SIZE=50                 # max queued requests (default: 50)
OPERATION_TIMEOUT=30000           # per-operation timeout, ms (default: 30000)

# Cache & telemetry
EXPRESSION_CACHE_SIZE=1000        # LRU expression-cache entries (default: 1000)
ENABLE_TELEMETRY=true             # start the metrics/health HTTP server (default: off)
TELEMETRY_PORT=9090               # metrics/health port (default: 9090)
```

Input **size limits** are fixed constants in `src/validation.ts` (not
environment-configurable): max matrix dimension 1000×1000, max array length
100000, max expression length 10000, max nesting depth 50.

## 🐛 Troubleshooting

- **`Unit "X" not found.`** — the unit isn't in MathTS's set. Use compound speed forms (`mi/h`, not `mph`); some astronomical/nautical units aren't available.
- **`Undefined symbol x`** — an expression left a free variable (e.g. mixing a symbolic term with a numeric one in `evaluate`). Supply `scope`, or keep symbolic and numeric parts separate.
- **Input rejected as too large** — inputs above the size limits (matrix 1000×1000, array 100000, expression 10000 chars, nesting depth 50) are refused by design. These limits are fixed constants in `src/validation.ts`.
- **Build/test issues** — ensure Bun ≥ 1.4 and Node ≥ 22, then `bun install && bun run build && bun run test`.

## 📚 Documentation

- **[CHANGELOG.md](CHANGELOG.md)** — version history
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — contribution guidelines
- **[SECURITY.md](SECURITY.md)** — security policy
- **[skills/math/SKILL.md](skills/math/SKILL.md)** — the `math` companion skill playbook

## 🤝 Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Fork, branch,
make changes, `bun run test`, commit with a conventional-commit message, and open a
pull request.

## 📄 License

ISC License — see [LICENSE](LICENSE).

## 🙏 Acknowledgments

- **[MathTS](https://www.npmjs.com/package/@danielsimonjr/mathts-compat)** — the TypeScript compute engine (mathjs-compatible API)
- **[MCP SDK](https://github.com/modelcontextprotocol)** — Model Context Protocol implementation

---

Made with ❤️ by the math-mcp contributors
