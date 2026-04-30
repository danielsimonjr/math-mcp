# Dependency Graph — Usage

This folder hosts a static-analysis script that maps the math-mcp source
tree, flags layering violations, and reports per-file test coverage. It is
the machine-checkable counterpart to `STRUCTURE-AUDIT-2026-04-29.md`.

## Run

```bash
npm run graph
```

Equivalent to:

```bash
npx tsx tools/generate-dependency-graph.ts
```

Outputs three artifacts in `tools/`:

| File | Purpose |
|------|---------|
| `dependency-graph.json` | Machine-readable. Keys: `files`, `folders`, `tests`, `layerViolations`, `stats`. |
| `dependency-graph.md`   | Human-readable. Stats + violations table + most-depended-on + per-file coverage map + folder dependencies. |
| `dependency-graph.mermaid` | Top-level folder diagram for paste-into-mermaid-renderers. |

## What it scans

- `src/**/*.ts` — every source file. Skips `*.d.ts`.
- `test/**/*.ts` — used to build the test-coverage map.
- Skipped: `dist/`, `node_modules/`, `wasm/build/`, anything under `*.cjs` (WASM bindings are JS, not part of the TS dep graph).

## Layer model

The script knows the layer assignment from `STRUCTURE-AUDIT-2026-04-29.md` §2:

```
L1: shared/constants.ts, shared/logger.ts
L2: errors.ts, utils.ts, degradation-policy.ts, wasm-executor.ts,
    routing-utils.ts, mathjs-shim.ts, types.ts
L3: validation.ts, rate-limiter.ts, expression-cache.ts, wasm-integrity.ts
L4: wasm-wrapper.ts, workers/, gpu/
L5: acceleration-router.ts, acceleration-router-compat.ts
L6: acceleration-adapter.ts, handler-utils.ts
L7: tool-handlers.ts
L8: index.ts, index-wasm.ts, health.ts, telemetry/
```

A "layer violation" is an import from layer N pointing to something in
layer M > N. Healthy state: zero violations.

## When to re-run

- After any structural change in `src/` (new file, moved file, renamed module).
- Before opening a PR that touches the layering (the violations table makes regressions obvious in code review).
- Periodically as a hygiene check.

## Updating the layer map

When you add a new top-level module to `src/`, also add a line to the
`LAYER_MAP` array in `tools/generate-dependency-graph.ts`. Files not in
the map default to layer 99 (treated as "top-level orchestrator", which
suppresses violation detection for that file's outbound imports).

## Limitations

- Only resolves relative imports. External imports (e.g. `mathjs`,
  `@modelcontextprotocol/sdk`) are not graphed.
- The "untested" list is a heuristic — it lists src files with no test
  file importing them directly. Files exercised only through transitive
  imports from a tested file are flagged as untested even if they are
  effectively covered. The audit's coverage matrix is the authoritative
  read for that reason.
- TypeScript-only constructs that appear in `export` declarations (e.g.
  type-only re-exports via `export type {}`) are partially handled but
  not exhaustively — interfaces and type aliases are captured, but
  `export *` re-exports are not flattened.

## Origin

Adapted from the equivalent script in the local Mathjs fork at
`~/Dropbox/Github/Mathjs/tools/generate-dependency-graph.ts`. The math-mcp
version drops factory-function parsing (math-mcp uses plain ESM) and
adds layer-violation detection + per-file test coverage mapping.
