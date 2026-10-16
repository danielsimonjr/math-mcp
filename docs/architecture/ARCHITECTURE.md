# math-mcp — Architecture

## Layers

Each file imports only files in a lower layer. The graph has no circular dependency. The runtime count and the type-only count are both 0. A direct read of the `import` statements in `src/` gives the same edges as `dependency-graph.json`.

| Layer | Files | Imports |
|---|---|---|
| 5 | `index.ts` | `register-tools`, `telemetry/server`, `utils` |
| 4 | `register-tools.ts`, `telemetry/server.ts` | `rate-limiter`, `tool-handlers`; `health`, `telemetry/metrics`, `utils` |
| 3 | `tool-handlers.ts`, `health.ts` | `errors`, `expression-cache`, `handler-utils`, `math-engine`, `utils`, `validation`; `rate-limiter`, `utils` |
| 2 | `expression-cache.ts`, `handler-utils.ts`, `rate-limiter.ts`, `telemetry/metrics.ts` | `utils`, `errors` |
| 1 | `utils.ts`, `validation.ts` | `errors`, `shared/constants`, `shared/logger` |
| 0 | `errors.ts`, `math-engine.ts`, `shared/constants.ts`, `shared/logger.ts`, `types.ts` | no file in `src/` |

`utils.ts` re-exports `logger` and `LogLevel`. Most files import the logger through `utils.ts`.

`math-engine.ts` is the only file that imports `@danielsimonjr/mathts-compat`. Four packages are runtime imports in `src/`: `@modelcontextprotocol/server` (with its `/stdio` entry), `@danielsimonjr/mathts-compat`, `prom-client` and `zod`.

## Data flow

1. An MCP host sends a tool call over stdio. `serveStdio` calls `createMathMcpServer` for each connection. The function calls `registerMathTools`.
2. `callTool` in `register-tools.ts` runs `withRateLimit(globalRateLimiter, () => withErrorHandling(handler, args))`. The rate limiter rejects a call with a `RateLimitError` before the handler runs.
3. The handler in `tool-handlers.ts` validates the input with `validation.ts`. The size limits are the `LIMITS` constants in that file.
4. `handleEvaluate`, `handleSimplify`, `handleDerivative` and `handleUnitConversion` call the engine under `withTimeout`. `handleEvaluate` and `handleSolve` compile an expression through `expression-cache.ts`.
5. `math-engine.ts` supplies the MathTS engine that performs the operation.
6. `withErrorHandling` turns a thrown error into an MCP error response. A successful result returns through `successResponse` in `handler-utils.ts`.

## Key design decisions

### One rate limiter around every call

**Decision:** `register-tools.ts` applies the rate limit and the error wrapper. `tool-handlers.ts` does neither.
**Rationale:** One call site covers all seven tools.
**Trade-offs:** The limiter is global. All clients of one process share one budget.

### Size limits guard large inputs

**Decision:** `validation.ts` limits the size of matrices, arrays and expressions.
**Rationale:** Synchronous JavaScript cannot stop in the middle of a calculation. `withTimeout` frees the caller but the calculation continues to run. A size limit stops the work before the work starts.
**Trade-offs:** A valid input above a limit fails.

### Opt-in telemetry

**Decision:** The metrics and health server in `telemetry/` starts only when `ENABLE_TELEMETRY` is `true`.
**Rationale:** A default run opens no HTTP port. The MCP protocol uses stdio only.
**Trade-offs:** A default run has no metrics.

## Findings from the dependency graph

- **Four exported telemetry symbols have no use.** Each symbol occurs once in the repository, at its own declaration. A search of the whole repository confirms the result. The symbols are `activeConnections`, `mcpRequests` and `rateLimitQueue` in `telemetry/metrics.ts`, and `getTelemetryServer` in `telemetry/server.ts`. The three metrics are declared. No code increments or reads them. The `prom-client` constructors register each metric with the registry. A scrape of `/metrics` therefore shows the metrics as series that stay at zero. To remove the series, delete the declarations. Deleting only the `export` keyword leaves the series.
- **`src/types.ts` is an empty module** with no importer (see OVERVIEW.md).
- **The repository has no duplicate symbol.** `duplicate-symbols.json` lists none.
- **Four files are orphans.** `src/types.ts` is unused. The three drivers in `test/` run by direct execution.

## Verification

Generated 2026-10-16 by `repo-tools map`.
Regenerate: `repo-tools map . --out=docs/architecture` · Check: `repo-tools check . --docs=docs/architecture`

| Claim | Value | Source |
|---|---|---|
| runtimeCircularDeps | 0 | dependency-graph.json |
| typeOnlyCircularDeps | 0 | dependency-graph.json |
| totalExports | 89 | dependency-graph.json |
| reachableFiles | 15 | dependency-graph.json |
| unusedExportsCount | 14 | unused-analysis.json |
