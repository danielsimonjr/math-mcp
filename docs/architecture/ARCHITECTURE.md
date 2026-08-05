# math-mcp — Architecture

## Layers

Dependencies point strictly downward. The graph has **zero circular dependencies**
(runtime and type-only both 0 — see Verification). Ordering below is measured from
`dependency-graph.json` edges.

```
index.ts                 MCP protocol: server setup, tool registration, stdio transport,
      │                    telemetry lifecycle (start/stop)
tool-handlers.ts         The seven tool implementations (fan-in 6 — tests import it too)
      │
math-engine.ts           Engine wrapper over @danielsimonjr/mathts-compat. The only file
      │                    that imports the math library.
validation.ts · rate-limiter.ts · expression-cache.ts
      │                  Cross-cutting guards each handler passes through
errors.ts                Error taxonomy — the most depended-upon file (fan-in 12)
shared/ (logger, constants) · utils.ts
```

`telemetry/` hangs off `index.ts` only (`startTelemetryServer`/`stopTelemetryServer`);
no tool code touches it. External surface is deliberately small: the MCP SDK,
`@danielsimonjr/mathts-compat`, and `prom-client` are the only runtime imports in `src/`.

## Data flow

1. MCP host sends a tool call over stdio → `index.ts` routes by tool name.
2. `tool-handlers.ts` validates input (`validation.ts`), applies rate limiting
   (`rate-limiter.ts`), and consults `expression-cache.ts`.
3. `math-engine.ts` executes the operation via mathts-compat.
4. Errors normalize through `errors.ts`; results return as MCP tool responses.

## Findings from the dependency graph

- **Four exported telemetry symbols are genuinely unused** — each occurs exactly once in
  the repo, at its own declaration (verified by whole-repo search, not only by the
  analyzer): `activeConnections`, `mcpRequests`, `rateLimitQueue`
  (`telemetry/metrics.ts`) and `getTelemetryServer` (`telemetry/server.ts`). The three
  metrics are declared but never incremented or read. **Caveat before deleting:**
  prom-client `Gauge`/`Counter` constructors self-register with the metrics registry, so
  the metrics still appear in `/metrics` scrape output as permanently-zero series even
  though the exported bindings are dead. Deleting the declarations removes those series;
  deleting only the `export` keyword does not.
- **`src/types.ts` is unimported by anything** (see OVERVIEW.md) — its docstring's claim
  of cross-layer use is stale.
- **Zero duplicate symbols** across the repo (duplicate-symbols.json).
- The seven `orphaned` entries are all verified live except `src/types.ts` — six are
  direct-execution entry shapes (committed bundle, npm-script drivers) invisible to
  static import analysis.

## Verification

Generated 2026-08-05 by `repo_map.py map`.
Regenerate: `python repo_map.py map <repo> --out docs/architecture`
Check: `python repo_map.py check <repo> --docs docs/architecture`

| Claim | Value | Source |
|---|---|---|
| runtimeCircularDeps | 0 | dependency-graph.json |
| typeOnlyCircularDeps | 0 | dependency-graph.json |
| totalExports | 86 | dependency-graph.json |
| reachableFiles | 14 | dependency-graph.json |
| unusedExportsCount | 14 | unused-analysis.json |
