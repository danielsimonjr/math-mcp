# math-mcp v4 — Full MathTS Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (tasks are tightly coupled through a shared build — inline execution with checkpoints fits better than subagent-per-task). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace mathjs entirely with MathTS (`@danielsimonjr/mathts-*`) as math-mcp's compute engine and delete the hand-rolled acceleration stack, keeping the 7 MCP tools' I/O contracts identical.

**Architecture:** Repoint the single engine shim at `@danielsimonjr/mathts-compat` (`create(all)`, a mathjs-API-compatible instance). MathTS bakes three-tier dispatch (WASM→ComputePool→JS) into its own functions, so the deep replacement deletes math-mcp's `AccelerationWrapper`/router/wasm/workers/gpu and calls MathTS directly, letting it tier internally.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `@danielsimonjr/mathts-compat` (+ transitive `-core`/`-matrix`/`-functions`/`-parallel`), Node ≥18, vitest + bespoke integration/correctness test runners.

## Global Constraints

- 7 MCP tools keep **identical input/output contracts** (byte-stable JSON envelopes).
- mathjs removed **entirely** — no fallback tier, no two-engine coexistence.
- Version: v3.5.1 → **v4.0.0** (breaking internal change).
- Deps **hybrid**: local link (`file:`/`npm link` to `~/Github/mathts`) in dev; pinned `@danielsimonjr/mathts-*@^x.y.z` in the committed/released state.
- Preserve `src/errors.ts` taxonomy + `successResponse`/error envelopes.
- Use `~/Github/mathts` only (ignore `~/Github/MathTS` and `~/Dropbox/Github/mathts`).
- Branch `feat/mathts-cutover`. Fix all issues encountered, preexisting or not.
- Correctness gate: existing `test/correctness-tests.js` + `test/integration-test.js` (their expected values were validated against mathjs and are baked in).

---

### Task 1: Wire MathTS, repoint engine shim, verify symbolic tools + accel behavior

**Files:**
- Modify: `package.json` (deps + scripts), `src/mathjs-shim.ts` → rename `src/math-engine.ts`
- Modify importers: `src/index.ts`, `src/index-wasm.ts`, `src/tool-handlers.ts`, `src/acceleration-*.ts` (transitional)
- Create: `scripts/verify-mathts-coverage.mjs` (one-off discovery script)

**Interfaces:**
- Produces: `math` default export from `src/math-engine.ts` — the `create(all)` MathTS-compat instance, API-compatible with the prior mathjs instance (`parse/evaluate/simplify/derivative/format/unit/multiply/inv/det/transpose/eigs/add/subtract/mean/median/mode/std/variance/min/max/sum/prod`).
- Discovery output (recorded in this task's commit message): whether compat matrix/stats calls self-accelerate, and the exact MathTS accel entry points if explicit wiring is needed by Tasks 2–3.

- [ ] **Step 1: Local-link MathTS into math-mcp (dev mode)**

```bash
cd ~/Github/mathts && npm install && npm run build   # ensure dist/ exists for all pkgs
cd ~/Github/math-mcp
npm install file:../mathts/compat   # compat pulls core/matrix/functions/parallel transitively
```
Expected: `@danielsimonjr/mathts-compat` resolves in `node_modules`. If transitive `@danielsimonjr/mathts-*` are unresolved (monorepo workspace deps), link them too: `npm install file:../mathts/core file:../mathts/matrix file:../mathts/functions file:../mathts/parallel`.

- [ ] **Step 2: Write the compat-coverage discovery script**

```js
// scripts/verify-mathts-coverage.mjs
import { create, all } from '@danielsimonjr/mathts-compat';
const math = create(all);
const fns = ['parse','evaluate','simplify','derivative','format','unit','multiply','inv','det','transpose','eigs','add','subtract','mean','median','mode','std','variance','min','max','sum','prod'];
const missing = fns.filter((f) => typeof math[f] !== 'function' && !(f === 'unit'));
console.log('present:', fns.filter((f) => typeof math[f] === 'function').join(', '));
console.log('MISSING:', missing.length ? missing.join(', ') : '(none)');
// accel probe: does a large matmul touch a MathTS backend?
const big = Array.from({ length: 128 }, () => Array.from({ length: 128 }, () => Math.random()));
console.time('matmul128'); math.multiply(big, big); console.timeEnd('matmul128');
```

- [ ] **Step 3: Run discovery; record findings**

Run: `node scripts/verify-mathts-coverage.mjs`
Expected: `MISSING: (none)`. Record in the commit body whether any function is missing (→ becomes a fix in Task 6) and the matmul timing (sanity that accel path is alive). **This output drives Tasks 2–3.**

- [ ] **Step 4: Replace the engine shim**

Rename `src/mathjs-shim.ts` → `src/math-engine.ts` with:
```ts
/** Single MathTS compute surface (replaces the former mathjs shim). */
import { create, all } from '@danielsimonjr/mathts-compat';
const math = create(all);
export default math;
```
Update every importer: `import math from './mathjs-shim.js'` → `import math from './math-engine.js'` in `src/index.ts`, `src/index-wasm.ts`, `src/tool-handlers.ts`, and any `src/acceleration-*.ts` still importing it.

- [ ] **Step 5: Build**

Run: `cd ~/Github/math-mcp && npm run build`
Expected: `tsc` exits 0. Fix any type mismatches at the seam (compat types vs former mathjs types) — these are real and fixed here, not deferred.

- [ ] **Step 6: Run the correctness + integration gate (symbolic tools)**

Run: `npm test && npm run test:correctness`
Expected: `evaluate`, `simplify`, `derivative`, `solve`, `unit_conversion` cases PASS. Matrix/stats cases may still route through the old `AccelerationWrapper` (untouched yet) — that's fine; they're addressed in Tasks 2–3. Any symbolic-tool failure is a real compat-fidelity diff: fix the handler or record an intended behavior change for `commands/math.md` (Task 5).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): repoint compute shim from mathjs to mathts-compat (symbolic tools)"
```

---

### Task 2: matrix_operations on MathTS native acceleration

**Files:**
- Modify: `src/tool-handlers.ts` (the `matrixOps` map + `handleMatrixOperations`)
- Modify/Delete: the matrix methods of `AccelerationWrapper` consumers

**Interfaces:**
- Consumes: `math` from `src/math-engine.ts`; the Task-1 discovery (auto-accel vs explicit).
- Produces: `handleMatrixOperations` returning the same JSON envelope as before for ops `multiply|determinant|transpose|inverse|add|subtract|eigenvalues`.

- [ ] **Step 1: Confirm the accel path (from Task 1 discovery)**

If compat matrix calls self-accelerate (expected): the `matrixOps` map calls `math.multiply/inv/det/transpose/eigs/add/subtract` directly and the `accelerationWrapper` param is dropped. If they do **not** self-accelerate: import MathTS's matrix backend (`@danielsimonjr/mathts-matrix` `BackendManager`) and route large inputs through it. Use whichever Task 1 confirmed.

- [ ] **Step 2: Rewrite `matrixOps` to call MathTS directly**

```ts
// src/tool-handlers.ts — matrixOps (no AccelerationWrapper)
const matrixOps = {
  multiply: (a, b) => math.multiply(a, b),
  inverse: (a) => math.inv(a),
  determinant: (a) => math.det(a),
  transpose: (a) => math.transpose(a),
  eigenvalues: (a) => math.eigs(a).values,
  add: (a, b) => math.add(a, b),
  subtract: (a, b) => math.subtract(a, b),
};
```
Update `handleMatrixOperations` to drop the `accelerationWrapper?` parameter and the `runAccelerated` wrapper for matrix ops (MathTS tiers internally). Keep the timeout/abort guard at the handler level if the test suite asserts it.

- [ ] **Step 3: Run matrix correctness tests**

Run: `npm run test:correctness -- --grep matrix 2>/dev/null || npm run test:correctness`
Expected: all `matrix_operations` cases PASS with byte-identical envelopes.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(matrix): route matrix_operations through MathTS native accel"
```

---

### Task 3: statistics on MathTS native acceleration

**Files:**
- Modify: `src/tool-handlers.ts` (the `statsOps` map + `handleStatistics`)

**Interfaces:**
- Consumes: `math` from `src/math-engine.ts`.
- Produces: `handleStatistics` returning the same envelope for `mean|median|mode|std|variance|min|max|sum|product`.

- [ ] **Step 1: Rewrite `statsOps` to call MathTS directly**

```ts
const statsOps = {
  mean: (d) => math.mean(d),
  median: (d) => math.median(d),
  mode: (d) => math.mode(d),
  std: (d) => math.std(d),
  variance: (d) => math.variance(d),
  min: (d) => math.min(d),
  max: (d) => math.max(d),
  sum: (d) => math.sum(d),
  product: (d) => math.prod(d),
};
```
Drop the `accelerationWrapper?` param + `runAccelerated` from `handleStatistics`. If Task 1 showed stats need explicit parallelism for large arrays, wrap large-`n` cases via `@danielsimonjr/mathts-parallel` `ComputePool` per the confirmed API.

- [ ] **Step 2: Run stats correctness tests**

Run: `npm run test:correctness`
Expected: all `statistics` cases PASS. (`std`/`variance` default to sample vs population — confirm the envelope matches the prior mathjs default; if MathTS differs, set the explicit option to match, since the contract is fixed.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(stats): route statistics through MathTS, drop AccelerationWrapper usage"
```

---

### Task 4: Delete the bespoke acceleration stack and mathjs

**Files:**
- Delete: `src/acceleration-router.ts`, `src/acceleration-adapter.ts`, `src/acceleration-router-compat.ts`, `src/degradation-policy.ts`, `src/routing-utils.ts`, `src/wasm-executor.ts`, `src/wasm-wrapper.ts`, `src/wasm-integrity.ts`, `src/gpu/`, `src/workers/`, `wasm/`, `scripts/generate-wasm-hashes.js`, `wasm-hashes.json`
- Modify: `src/types.ts` (remove `AccelerationWrapper`), `src/index-wasm.ts`/`src/index.ts` (single entrypoint), `package.json` (scripts + main), `vendor/` (remove mathjs tarball)

- [ ] **Step 1: Delete dead files**

```bash
cd ~/Github/math-mcp
git rm -r src/acceleration-router.ts src/acceleration-adapter.ts src/acceleration-router-compat.ts \
  src/degradation-policy.ts src/routing-utils.ts src/wasm-executor.ts src/wasm-wrapper.ts \
  src/wasm-integrity.ts src/gpu src/workers wasm scripts/generate-wasm-hashes.js wasm-hashes.json
git rm vendor/mathjs-*.tgz
```

- [ ] **Step 2: Collapse to one entrypoint**

Pick `src/index.ts` as the sole server entry (the WASM-specific `index-wasm.ts` is obsolete). Merge any still-needed startup logic from `index-wasm.ts` into `index.ts`, then `git rm src/index-wasm.ts`. Remove the `AccelerationWrapper` interface from `src/types.ts` and any now-dead imports.

- [ ] **Step 3: Clean package.json**

Remove `"mathjs"` dep; remove `build:wasm*`, `verify:wasm`, `verify:hashes`, `generate:hashes`, `check:deps` (if wasm-specific) scripts; set `"main": "dist/index.js"`, `"start": "node dist/index.js"`; bump `"version": "4.0.0"`. Run `npm install` to update the lockfile.

- [ ] **Step 4: Build + full suite**

Run: `npm run build && npm run test:all && npm run test:unit`
Expected: 0 type errors, all tests green. Remove/replace any test that exercised the deleted accel stack (e.g., `test/security/` cases for wasm-integrity) — porting assertions that still apply, deleting those that tested removed code.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor!: delete bespoke accel stack + mathjs; single entrypoint; v4.0.0"
```

---

### Task 5: Update the MCP plugin wiring, command doc, and dependency workflow

**Files:**
- Modify: `~/.claude/local-marketplace/math-mcp/.mcp.json`, `~/.claude/local-marketplace/math-mcp/commands/math.md`, `~/.claude/local-marketplace/math-mcp/.claude-plugin/plugin.json` (version), `~/Github/math-mcp/CLAUDE.md`, `~/Github/math-mcp/README.md`, `~/Github/math-mcp/CHANGELOG.md`

- [ ] **Step 1: Update `.mcp.json`**

Point `args` at `dist/index.js`; remove the `DISABLE_WASM_INTEGRITY_CHECK` env (wasm gone). Keep the `_RETRY` cache-buster convention.

- [ ] **Step 2: Update `commands/math.md`**

Remove mathjs-specific caveats: the "local mathjs fork" unit-name notes, the mathjs symbolic-integration paragraph. Replace with MathTS equivalents only where behavior actually differs (per Task 1/2/3 findings). Keep tool usage guidance otherwise intact.

- [ ] **Step 3: Document the hybrid dep workflow in CLAUDE.md + bump plugin version**

Add a section: dev = `npm install file:../mathts/*`; release = pin `@danielsimonjr/mathts-*@^x.y.z` then `npm install`. Set `.claude-plugin/plugin.json` version to match (4.0.0). Add a CHANGELOG entry for v4.0.0.

- [ ] **Step 4: Switch committed deps to pinned npm (release state)**

```bash
cd ~/Github/math-mcp
npm install @danielsimonjr/mathts-compat@^0.1.8   # + any explicit transitive pins
npm run build && npm run test:all
```
Expected: green with npm-resolved (not file:) deps — this is the state we commit.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs+build: MathTS plugin wiring, math.md cleanup, hybrid dep workflow, v4 release deps"
```

---

### Task 6: Final verification, MathTS-suite gate, and preexisting-issue sweep

**Files:** repo-wide

- [ ] **Step 1: math-mcp full quality gate**

Run: `npm run build && npm run test:all && npm run test:unit && npm run test:security && npm run lint && npm run type-check`
Expected: all green. Fix every failure encountered — including preexisting lint/type issues unrelated to the cutover (standing instruction: defer nothing).

- [ ] **Step 2: MathTS-suite gate (depended packages)**

Run: `cd ~/Github/mathts && npx turbo test --filter=@danielsimonjr/mathts-compat --filter=@danielsimonjr/mathts-core --filter=@danielsimonjr/mathts-matrix --filter=@danielsimonjr/mathts-functions --filter=@danielsimonjr/mathts-parallel`
Expected: green for the packages math-mcp depends on. If a depended package fails, fix it in MathTS (in scope per "fix all issues, preexisting or not") or pin around it and record the gap.

- [ ] **Step 3: Live MCP smoke test**

User runs `/reload-plugins`, then exercise each of the 7 tools via the `mcp__plugin_math-mcp_math-mcp__*` tools (evaluate `2^10`, simplify `2x+3x`, derivative of `x^2`, solve, a 3×3 matrix multiply/inverse/eigs, statistics over a vector, a unit conversion). Confirm envelopes look correct.

- [ ] **Step 4: Final commit + push (on user go-ahead)**

```bash
git add -A && git commit -m "test: full v4 verification + preexisting-issue fixes"
# push only on explicit user go-ahead (push = publish):
# git push -u origin feat/mathts-cutover
```

---

## Self-Review

**Spec coverage:** library swap (T1) ✓ · accel replacement (T2,T3,T4) ✓ · delete mathjs+stack (T4) ✓ · 7-tool contract stability (correctness gate each task) ✓ · error taxonomy preserved (T1 step 5, T2/T3 envelopes) ✓ · hybrid deps (T1 dev / T5 release) ✓ · v4.0.0 (T4,T5) ✓ · `/math` doc (T5) ✓ · MathTS-suite gate (T6) ✓ · duplicate-checkout flag (Global Constraints) ✓.

**Placeholder scan:** the only deliberately deferred specifics are the matrix/stats accel entry points, resolved empirically by Task 1's discovery script before Tasks 2–3 consume them — not a TBD, a sequenced discovery.

**Type consistency:** `math` default export name is stable across T1–T3; `matrixOps`/`statsOps` op keys match the existing tool contract (`multiply/inverse/determinant/transpose/eigenvalues/add/subtract`, `mean/median/mode/std/variance/min/max/sum/product`).
