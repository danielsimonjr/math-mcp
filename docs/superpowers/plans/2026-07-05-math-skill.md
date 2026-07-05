# `math` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a guidance/playbook skill named `math` inside the `math-mcp` plugin (`skills/math/`, loads as `math-mcp:math`, slash `/math`) that teaches Claude to offload computation to the server's 7 pure tools and use them correctly.

**Architecture:** Two Markdown files — `skills/math/SKILL.md` (frontmatter + playbook body) and `skills/math/README.md` (short human overview). No scripts, no server code, no new tools, no rebuild. Then a plugin release: bump `plugin.json` to 4.2.0, update repo README + CHANGELOG, atomic commit, push to `master`.

**Tech Stack:** Markdown + YAML frontmatter. Reference style: the `windows` skill at `C:\Users\danie\Github\windows-mcp\skills\windows\SKILL.md` and the `dropbox` skill at `C:\Users\danie\Github\dropbox-mcp\skills\dropbox\SKILL.md`.

## Global Constraints

- Skill `name:` frontmatter is exactly `math` (→ load id `math-mcp:math`, slash `/math`). Copy verbatim.
- The skill adds **no tools and no scripts** — judgment/guidance only.
- The 7-tool table must match the live server's tools and signatures — verified against `ToolSearch`, never assumed.
- **Bump ONLY `.claude-plugin/plugin.json` (4.1.3 → 4.2.0).** Do NOT change `package.json` (stays 4.1.3), do NOT rebuild the bundle. The running server legitimately keeps reporting 4.1.3 (same principle as windows-mcp holding its binary at 0.4.1).
- Design/skill docs carry **no version numbers or dates in the body** (that lives in the CHANGELOG).
- Every gotcha/claim must trace to real tool behavior (the live tool schemas, or a live call). Verify with `honest-claude`. The "Undefined symbol x" case was observed live; the `mph` rejection must be confirmed with a live call, not restated from the schema.
- Files are LF-normalized on commit (repo default); do not introduce CRLF.
- Default branch is `master` (direct-push).

---

### Task 1: Author `skills/math/SKILL.md`

**Files:**
- Create: `C:\Users\danie\Github\math-mcp\skills\math\SKILL.md`
- Reference (read for style, do not modify): `C:\Users\danie\Github\windows-mcp\skills\windows\SKILL.md`

**Interfaces:**
- Produces: a skill whose frontmatter `name: math` makes it load as `math-mcp:math`. Task 2's README points at it; Task 3 releases it.

**Deliverable:** one Markdown file with the frontmatter below (verbatim) and a body containing the five content blocks specified. Match the `windows`/`dropbox` prose voice (tables for matrices, fenced blocks for tool call sequences).

- [ ] **Step 1: Write the frontmatter verbatim**

```yaml
---
name: math
description: "Playbook for computing with the math-mcp server's 7 tools — evaluate, derivative, solve, simplify, matrix_operations, statistics, unit_conversion (mathjs-powered CAS/stats/units). Core rule: OFFLOAD non-trivial computation to these tools instead of doing mental math, which is error-prone. Use when the user says 'evaluate/compute this', 'what is <expression>', 'differentiate' or 'derivative of', 'solve for x', 'simplify', 'multiply/invert these matrices', 'determinant/eigenvalues', 'mean/median/std/variance of', 'convert X to Y units', or asks for any exact or non-trivial calculation. Steers toward the tool over self-computed arithmetic, picks evaluate vs. the specialized tools, and flags mathjs-syntax gotchas. Does NOT add tools; it is guidance over the math-mcp server. Not a plotting/graphing tool and not a proof assistant."
---
```

- [ ] **Step 2: Write the intro + skill root + slash trigger**

Short intro (2–4 sentences): the skill is the judgment layer over the `math-mcp` server's 7 pure tools; it adds no tools. State: **Skill root** — ships inside the `math-mcp` plugin (repo `danielsimonjr/math-mcp`, `skills/math/`); slash trigger `/math`. Mirror the `windows` skill's "Skill root" paragraph.

- [ ] **Step 3: Write "The offload rule" (core message)**

Non-trivial computation → call `math-mcp`, don't mental-math (self-computed math is error-prone). State the boundary explicitly: trivial inline arithmetic (`2+2`, a single-digit product) may be answered directly; but **exact/CAS results, calculus, any matrix beyond a 2×2 by hand, statistics over a dataset, unit conversions, and any figure the user will rely on** go to the tool. Frame as the analog of "prefer the MCP over ad-hoc work" from the windows skill.

- [ ] **Step 4: Write "Tool selection: `evaluate` vs. the 6 specialized tools" + the 7-tool table**

Explain the overlap is intentional: `evaluate` is the mathjs workhorse and can inline `derivative(...)`, `det(...)`, etc. Guidance: use `evaluate` for a one-off general expression or combining operations (supply `scope` for variables); use the **specialized** tool when you want its focused/validated result or its specific op. Then include this table verbatim (grounded from the live schemas):

| Tool | Signature | Purpose |
|---|---|---|
| `evaluate` | `expression`, `scope?` | General mathjs eval: arithmetic, algebra, calculus, matrices. Ex: `2+2`, `sqrt(16)`, `derivative(x^2, x)`, `det([[1,2],[3,4]])`. `scope` supplies variables, e.g. `{x: 5}`. |
| `derivative` | `expression`, `variable` | Symbolic d/d(var). `derivative("x^2","x") → "2*x"`. |
| `solve` | `equation`, `variable` | Solve an equation. `solve("x^2 - 4 = 0","x")`. |
| `simplify` | `expression`, `rules?` | Symbolic simplify. `"2*x + x" → "3*x"`. |
| `matrix_operations` | `operation`, `matrix_a`, `matrix_b?` | Matrix algebra. `operation ∈ {multiply, inverse, determinant, transpose, eigenvalues, add, subtract}`. Matrices are **JSON strings**: `matrix_a="[[1,2],[3,4]]"`. |
| `statistics` | `operation`, `data` | Dataset stats. `operation ∈ {mean, median, mode, std, variance, min, max, sum, product}`. `data` is a **JSON string**: `"[1,2,3,4,5]"`. `mode` returns an **array**. |
| `unit_conversion` | `value`, `target_unit` | Dimensional conversion. `value="5 inches"`, `target_unit="cm"`. Use compound forms (`mi/h`, `km/h`); `mph`/`kph`/`knot` are NOT recognized. |

Add: "If a `math-mcp` tool isn't loaded, fetch its schema via `ToolSearch select:mcp__plugin_math-mcp_math-mcp__<tool>`."

- [ ] **Step 5: Write the five workflow playbooks**

For each, give the tool call sequence in a fenced block + 2–4 sentences of guidance:
1. **Solve-and-verify** — `solve(equation, variable)` → for each root, `evaluate(<LHS>, scope={variable: root})` and confirm it is ~0. Do not report roots unverified.
2. **Calculus pipeline** — `derivative(expr, "x")` → `simplify(<result>)` → `evaluate(<result>, scope={x: <point>})` for a number.
3. **Matrix pipeline** — `matrix_operations(op, matrix_a[, matrix_b])` with JSON-string matrices (`"[[…],[…]]"`) for multiply/inverse/determinant/transpose/eigenvalues/add/subtract; use `evaluate("det([[…]])")` for one-off matrix expressions.
4. **Statistics** — `statistics(op, data)` with a JSON-string array for mean/median/mode/std/variance/min/max/sum/product; note `mode` returns an array.
5. **Unit conversion** — `unit_conversion(value, target_unit)` using compound unit forms.

- [ ] **Step 6: Write "Correct-usage gotchas"**

(The "rails" analog — usage-correctness, not safety; nothing here is destructive. State that up front.)
- **Symbolic vs. numeric in `evaluate`** — mixing a symbolic term with a numeric one (e.g. `sqrt(16) + derivative(x^2, x)`) throws **"Undefined symbol x"** (the symbolic part leaves a free variable). Keep symbolic and numeric separate, or supply `scope`.
- **Pass a point via `scope`** (`evaluate("2*x", scope={x: 5})`) rather than string-substituting.
- **JSON-string inputs** — `matrix_operations` matrices and `statistics` data are **strings** containing JSON arrays (`"[[1,2],[3,4]]"`, `"[1,2,3]"`), not native arrays.
- **Units** — use `mi/h`, `km/h`, `m/s`; `mph`/`kph`/`knot` are rejected.
- **Results may be strings** — `evaluate` can return a string (`"60"`); parse if a downstream step needs a number.
- **mathjs syntax** — `^` for powers, function-call forms (`det(...)`, `sqrt(...)`), explicit `*`.

- [ ] **Step 7: Self-review the Markdown (doc task — replaces TDD RED/GREEN)**

Read top to bottom. Confirm: frontmatter is valid YAML and `name: math`; the offload rule, tool-selection + 7-tool table, five workflows, and gotchas are all present; no placeholder text; tables render; no version numbers/dates in the body.

- [ ] **Step 8: Verify claims with honest-claude + confirm the `mph` gotcha live**

Invoke the `honest-claude` skill. Ground every gotcha and tool-table fact against the live schemas. Then confirm the `mph` behavior with a REAL call (do not just restate the schema):
```
ToolSearch select:mcp__plugin_math-mcp_math-mcp__unit_conversion
unit_conversion(value="60 mi/h", target_unit="mph")
```
Observe the result. If `mph` is rejected/errors while `mi/h` works, the gotcha is grounded — keep it. If the observed behavior differs, correct the SKILL.md text to match what actually happened.

- [ ] **Step 9: Verify the 7-tool table against the LIVE server**

```
ToolSearch  query: "+math-mcp"   max_results: 20
```
Every tool in the table must appear in the live registry; every live `mcp__plugin_math-mcp_math-mcp__*` tool must be in the table. Confirm the signatures (arg names, enums) match. If the live server differs, correct the table — the server is the source of truth.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/danie/Github/math-mcp"
git add skills/math/SKILL.md
git commit -m "feat(skill): add math-mcp:math playbook SKILL.md"
```

---

### Task 2: Author `skills/math/README.md`

**Files:**
- Create: `C:\Users\danie\Github\math-mcp\skills\math\README.md`
- Reference (read for style): `C:\Users\danie\Github\windows-mcp\skills\windows\README.md`

**Interfaces:**
- Consumes: the SKILL.md from Task 1.

- [ ] **Step 1: Write the README**

A short human-facing overview (~20–40 lines): what the skill is (a playbook over the `math-mcp` server, not new tools); how it loads (**state the load id `math-mcp:math` and slash `/math`**); the offload rule in one sentence; a one-line list of the five workflows (solve-and-verify, calculus pipeline, matrix pipeline, statistics, unit conversion); and a pointer to `SKILL.md`. Do not duplicate the SKILL body. No version/date.

- [ ] **Step 2: Self-review**

Confirm: no placeholders; the load id `math-mcp:math` AND slash `/math` both present; paths correct; no duplication of SKILL.md; no version/date.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/danie/Github/math-mcp"
git add skills/math/README.md
git commit -m "docs(skill): add math skill README"
```

---

### Task 3: Release — plugin version bump, repo docs, push

**Files:**
- Modify: `C:\Users\danie\Github\math-mcp\.claude-plugin\plugin.json` (version `4.1.3` → `4.2.0`)
- Modify: `C:\Users\danie\Github\math-mcp\CHANGELOG.md`
- Modify: `C:\Users\danie\Github\math-mcp\README.md`
- **Do NOT modify:** `package.json` (stays 4.1.3) or any bundle/dist file (no rebuild — see Global Constraints).

**Interfaces:**
- Consumes: `skills/math/` from Tasks 1–2.

- [ ] **Step 1: Bump `plugin.json`**

Change the `"version"` field from `"4.1.3"` to `"4.2.0"`. Leave `name` and `description` unchanged. (This is what `/plugin marketplace update` keys on to re-clone; without the bump the new skill won't be pulled.)

- [ ] **Step 2: Add the 4.2.0 CHANGELOG section (leave the existing Unreleased CI fix in place)**

The CHANGELOG already has a well-formed `## [Unreleased]` holding a CI fix (an engine/CI change, not part of this plugin release). Leave that Unreleased block exactly as-is, and insert a new `## [4.2.0]` section BETWEEN `## [Unreleased]` and `## [4.1.3] - 2026-06-24`:

```markdown
## [4.2.0] - 2026-07-05

### Added
- **Companion `math` skill** (`skills/math/`, loads as `math-mcp:math`, slash
  `/math`) — a guidance/playbook over the server's 7 tools: the core rule to
  offload non-trivial computation to the tool instead of mental math, `evaluate`
  vs. the six specialized tools, a 7-tool table, five workflow playbooks
  (solve-and-verify, calculus, matrix, statistics, units), and mathjs-syntax
  gotchas. No new tools; the server engine is unchanged (still reports 4.1.3;
  `package.json` unchanged).

## [4.1.3] - 2026-06-24
```

(The CI fix stays under `## [Unreleased]` because no engine/npm release is happening — this is a plugin-packaging release scoped to the skill.)

- [ ] **Step 3: Update the repo `README.md`**

Add a short "## Companion skill" subsection (2–4 lines) after the intro/features: the plugin also ships a `math` skill (`math-mcp:math`, `/math`) — a playbook that steers Claude to offload computation to these tools with composed workflows; see `skills/math/SKILL.md`. No version/date in the README body.

- [ ] **Step 4: Verify no unintended version drift**

```bash
cd "C:/Users/danie/Github/math-mcp"
grep -n '"version"' .claude-plugin/plugin.json    # expect 4.2.0
grep -n '"version"' package.json                  # expect STILL 4.1.3 (unchanged)
git status -s                                       # expect only plugin.json, CHANGELOG.md, README.md modified
```
Expected: `plugin.json` = 4.2.0, `package.json` = 4.1.3 (intentional), and no bundle/dist/src files staged.

- [ ] **Step 5: Atomic commit + push**

```bash
cd "C:/Users/danie/Github/math-mcp"
git add .claude-plugin/plugin.json CHANGELOG.md README.md
git commit -m "release: math-mcp 4.2.0 — ship the math companion skill"
git push origin master
```

- [ ] **Step 6: Verify the push reached the remote (second method)**

```bash
git -C "C:/Users/danie/Github/math-mcp" ls-remote origin -h refs/heads/master
git -C "C:/Users/danie/Github/math-mcp" rev-parse HEAD
```
Expected: the two SHAs match (local HEAD == remote master).

---

## Delivery (post-plan, controller/user step — not a task)

After all tasks pass review: `/plugin marketplace update local-marketplace` then `/reload-plugins` (fresh re-clone lands `skills/math/`). Final verification: confirm `math-mcp:math` appears in the reloaded skills list and `/math` triggers it. Caution (this machine): after a marketplace update, check `/mcp` — fresh clones can be incomplete; repair per the plugin-cache recipe if a server shows `× failed`.

## Self-Review (plan vs. spec)

- **Spec coverage:** Placement/load → Tasks 1–2 + Delivery. Offload rule → Task 1 Step 3. `evaluate`-vs-specialized + 7-tool table → Task 1 Steps 4 + 9 verify. Five workflows → Task 1 Step 5. Gotchas → Task 1 Step 6 (+ live `mph` confirm in Step 8). README → Task 2. Release (plugin.json 4.2.0 / package.json held / CHANGELOG / README / commit / push) → Task 3. Success criteria 1–5 all mapped (criterion 5 = Delivery step). No gaps.
- **Placeholder scan:** none — frontmatter, 7-tool table, workflow sequences, gotchas, CHANGELOG block all given verbatim.
- **Consistency:** skill name `math` and load id `math-mcp:math` identical across all tasks; version target 4.2.0 (plugin.json) with package.json explicitly held at 4.1.3, re-checked in Task 3 Step 4; tool count 7 asserted in Task 1 Step 4 and verified in Step 9.
