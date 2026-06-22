# math-mcp v4 — Full MathTS Cutover (Design Spec)

**Date:** 2026-06-22
**Status:** Approved (design); implementation pending plan
**Author:** Daniel Simon Jr. (with Claude Code)
**Repo:** `~/Github/math-mcp` · branch `feat/mathts-cutover`

## Goal

Replace **mathjs** entirely with **MathTS** (`@danielsimonjr/mathts-*`) as the
computation engine behind `math-mcp`, and replace math-mcp's hand-rolled
acceleration stack with MathTS's native three-tier dispatch. The 7 MCP tools
keep **identical input/output contracts**; only the engine underneath changes.
Ships as **math-mcp v4.0.0** (breaking internal change, stable MCP surface).

## Decisions (locked with user)

- **Depth:** Deep replacement — swap the library *and* delete math-mcp's bespoke
  GPU/Workers/WASM stack in favor of MathTS's `BackendManager`/`ComputePool`.
- **Cutover:** **Clean, full replacement.** mathjs is removed entirely — no
  fallback tier, no two-engine coexistence. (Supersedes an earlier
  "per-tool incremental" idea; the latest instruction — "replace mathjs
  entirely" — governs.)
- **Structure:** Approach B — repoint the single `mathjs-shim.ts` at
  `@danielsimonjr/mathts-compat` and migrate handlers in place.
- **Dependencies:** Hybrid — local monorepo link (`file:`/npm-link to
  `~/Github/mathts`) during development; pinned npm versions
  (`@danielsimonjr/mathts-*@^x.y.z`) for committed/released builds.
- **Contract:** The 7 MCP tools' JSON input/output stay byte-stable.
- **Versioning:** in-place `~/Github/math-mcp`, v3.5.1 → **v4.0.0**.
- **Standing instruction:** fix all issues encountered, preexisting or not;
  defer nothing.

## Architecture

Keep the MCP server shell and the 7 tool handlers. Swap the engine by:

1. Repointing `src/mathjs-shim.ts` from mathjs → `@danielsimonjr/mathts-compat`
   (`create(all)` produces a mathjs-API-compatible instance).
2. Replacing the hand-rolled acceleration layer with MathTS's native
   `BackendManager` (matrix WASM/GPU backend selection) and `ComputePool`
   (parallel ops), keeping the existing `runAccelerated()` timeout/abort wiring
   but pointing it at MathTS.
3. Deleting mathjs and the bespoke accel stack.

### Files deleted (accel stack → MathTS)

`acceleration-router.ts`, `acceleration-adapter.ts`,
`acceleration-router-compat.ts`, `degradation-policy.ts`, `routing-utils.ts`,
`wasm-executor.ts`, `wasm-wrapper.ts`, `wasm-integrity.ts`, `gpu/`, `workers/`,
the `wasm/` AssemblyScript project, and supporting scripts
(`generate-wasm-hashes.js`, `verify:wasm`/`verify:hashes` build steps).
`wasm-hashes.json` and `DISABLE_WASM_INTEGRITY_CHECK` env become obsolete.

### Files changed

- `src/mathjs-shim.ts` → MathTS surface (rename to `math-engine.ts` for honesty;
  update importers).
- `src/tool-handlers.ts` → matrix/statistics handlers call MathTS native accel
  instead of `AccelerationWrapper`.
- `package.json` → drop mathjs; add MathTS packages; drop wasm build/verify
  scripts; bump to 4.0.0.
- `.mcp.json` (in `~/.claude/local-marketplace/math-mcp/`) → drop the
  `DISABLE_WASM_INTEGRITY_CHECK` env and the `index-wasm.js` entry if the
  entrypoint changes (likely `dist/index.js` after wasm removal).
- `commands/math.md` → remove mathjs-specific caveats (unit-name spellings,
  symbolic-integration note); reflect MathTS behavior.
- `CLAUDE.md` (math-mcp) → document the hybrid dependency workflow.

## The 7 tools → MathTS mapping (verified against `tool-handlers.ts`)

| Tool | Today (mathjs) | After |
|---|---|---|
| `evaluate` | `parse` / `evaluate` (`safeEvaluate`) / `format` | compat `parse`/`evaluate`/`format` |
| `simplify` | `simplify` (+ optional rules) | compat `simplify` |
| `derivative` | `derivative` | compat `derivative` |
| `solve` | `parse` + `simplify` (limited `= 0` form) | compat equivalents; contract unchanged |
| `matrix_operations` | `AccelerationWrapper` → `multiply/inv/det/transpose/eigs/add/subtract` | MathTS `matrix` `BackendManager` + `linalg` (det/inv/eig) |
| `statistics` | `AccelerationWrapper.statsX` → `mean/median/mode/std/variance/min/max/sum/prod` | MathTS `parallel` `ComputePool` ops + `statistics` pkg |
| `unit_conversion` | `unit(v).to(u)` | compat `unit(v).to(u)` |

`runAccelerated((sig) => ...)` timeout/abort wiring is preserved; only the
underlying call target changes.

## Error handling

Preserve `src/errors.ts` taxonomy and `successResponse`/error envelopes so MCP
responses stay byte-stable. Translate MathTS exceptions into the existing error
types at the engine seam (`math-engine.ts` and the matrix/stats handlers).

## Testing & cutover sequence

1. Wire deps (local link), repoint shim, get `tsc` + server boot green.
2. Run existing `integration-test.js` + `correctness-tests.js` — their expected
   values (validated against mathjs) are the correctness gate. mathjs need not be
   present; the expected outputs are baked in.
3. Migrate `matrix_operations` and `statistics` to MathTS native accel; re-run.
4. Delete accel stack + mathjs; re-run full suite (`test:all`, `test:unit`,
   `test:security`).
5. Update `commands/math.md` and `CLAUDE.md`.
6. **Design gate:** MathTS's own test suite passes for the depended-on packages
   (compat, core, matrix, functions, parallel, linalg, statistics) — it is v0.1.x.

## Dependency wiring (hybrid)

- **Dev:** `file:../mathts/<pkg>` or `npm link` so math-mcp tracks live MathTS.
- **Release:** swap to pinned `@danielsimonjr/mathts-*@^x.y.z` before commit/build.
- Document both modes in math-mcp `CLAUDE.md`.

## Risks

- **MathTS v0.1.x maturity** → mitigated by the correctness-test gate + the
  MathTS-own-suite gate before cutover.
- **compat fidelity** on the ~22 used functions (esp. `format` precision,
  `simplify` canonical form, unit-name spellings) → correctness tests surface
  diffs; genuine behavior changes get reflected in `commands/math.md`.
- **Three on-disk MathTS copies** (`~/Github/mathts`, `~/Github/MathTS`,
  `~/Dropbox/Github/mathts`) → use `~/Github/mathts` only; flag the others for
  separate reconciliation.

## Out of scope

- Reconciling the duplicate MathTS checkouts (flagged, handled separately).
- Adding new MCP tools or changing tool I/O contracts.
- Publishing new MathTS npm versions (release wiring assumes existing published
  versions or a publish step the user controls).
