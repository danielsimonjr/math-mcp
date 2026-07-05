---
name: math
description: "Playbook for computing with the math-mcp server's 7 tools — evaluate, derivative, solve, simplify, matrix_operations, statistics, unit_conversion (mathjs-powered CAS/stats/units). Core rule: OFFLOAD non-trivial computation to these tools instead of doing mental math, which is error-prone. Use when the user says 'evaluate/compute this', 'what is <expression>', 'differentiate' or 'derivative of', 'solve for x', 'simplify', 'multiply/invert these matrices', 'determinant/eigenvalues', 'mean/median/std/variance of', 'convert X to Y units', or asks for any exact or non-trivial calculation. Steers toward the tool over self-computed arithmetic, picks evaluate vs. the specialized tools, and flags mathjs-syntax gotchas. Does NOT add tools; it is guidance over the math-mcp server. Not a plotting/graphing tool and not a proof assistant."
---

# Math

A judgment layer over the `math-mcp` server's 7 pure computation tools — expression evaluation, calculus, equation solving, simplification, matrix algebra, statistics, and unit conversion. This skill adds no tools of its own: every action below is one of the server's existing MCP tools. Its job is to steer you toward calling the tool instead of computing in your head, help you pick `evaluate` vs. a specialized tool, sequence multi-step workflows correctly, and flag the mathjs-syntax gotchas that produce wrong or confusing results.

**Skill root**: this skill ships inside the `math-mcp` plugin (repo `danielsimonjr/math-mcp`, `skills/math/`). Slash trigger: `/math`.

## The offload rule

**Non-trivial computation goes to `math-mcp`, not mental math.** Self-computed arithmetic is error-prone — the moment a calculation is worth getting exactly right, call the tool instead of estimating or working it out by hand. This is the same principle as "prefer the MCP over ad-hoc work" from the `windows` skill, applied to numbers instead of the desktop.

Where the line sits:
- **Trivial inline arithmetic** — `2+2`, a single-digit product, a fact you already know cold — may be answered directly.
- **Everything else goes to the tool**: exact/CAS results, any derivative or calculus step, any matrix operation beyond a hand-checkable 2×2, statistics over a real dataset, unit conversions, and any figure the user will actually rely on (a report number, a formula check, an engineering value). If it's worth being right about, it's worth calling the tool.

## Tool selection: `evaluate` vs. the 6 specialized tools

The overlap between `evaluate` and the specialized tools is intentional. `evaluate` is the mathjs workhorse — it can inline `derivative(...)`, `det(...)`, and most of what the specialized tools do, all in one expression. Use `evaluate` for a one-off general expression or when combining several operations in a single call (pass a `scope` object to supply variables). Reach for a **specialized** tool when you want its narrower, validated result shape or its specific operation directly — e.g. a clean symbolic derivative string from `derivative`, or an enum-constrained matrix op from `matrix_operations`.

| Tool | Signature | Purpose |
|---|---|---|
| `evaluate` | `expression`, `scope?` | General mathjs eval: arithmetic, algebra, calculus, matrices. Ex: `2+2`, `sqrt(16)`, `derivative(x^2, x)`, `det([[1,2],[3,4]])`. `scope` supplies variables, e.g. `{x: 5}`. |
| `derivative` | `expression`, `variable` | Symbolic d/d(var). `derivative("x^2","x") → "2*x"`. |
| `solve` | `equation`, `variable` | Solve an equation. `solve("x^2 - 4 = 0","x")`. |
| `simplify` | `expression`, `rules?` | Symbolic simplify. `"2*x + x" → "3*x"`. |
| `matrix_operations` | `operation`, `matrix_a`, `matrix_b?` | Matrix algebra. `operation ∈ {multiply, inverse, determinant, transpose, eigenvalues, add, subtract}`. Matrices are **JSON strings**: `matrix_a="[[1,2],[3,4]]"`. |
| `statistics` | `operation`, `data` | Dataset stats. `operation ∈ {mean, median, mode, std, variance, min, max, sum, product}`. `data` is a **JSON string**: `"[1,2,3,4,5]"`. `mode` returns an **array**. |
| `unit_conversion` | `value`, `target_unit` | Dimensional conversion. `value="5 inches"`, `target_unit="cm"`. Use compound forms (`mi/h`, `km/h`); `mph`/`kph`/`knot` are NOT recognized. |

If a `math-mcp` tool isn't loaded, fetch its schema via `ToolSearch select:mcp__plugin_math-mcp_math-mcp__<tool>`.

## Workflow playbooks

### 1. Solve-and-verify

```
solve(equation, variable)
  → for each root: evaluate(<LHS>, scope={variable: root})
  → confirm each result is ~0
```

`solve` can return multiple roots (including complex ones for higher-degree polynomials) — don't stop at the first. Substitute each root back into the original left-hand side via `evaluate` with `scope`, and confirm the result is zero (or numerically negligible for irrational/floating-point roots) before reporting it. Do not report a root as a solution unless it has been verified this way.

### 2. Calculus pipeline

```
derivative(expr, "x")
  → simplify(<result>)
  → evaluate(<result>, scope={x: <point>})
```

Differentiate symbolically first, simplify the raw derivative into its cleanest form, then plug in a specific point via `scope` to get a number. Skipping the simplify step is fine for a quick check, but for anything the user will read, simplify first — raw derivatives are often unnecessarily verbose.

### 3. Matrix pipeline

```
matrix_operations(operation, matrix_a[, matrix_b])
```

Use `matrix_operations` for multiply/inverse/determinant/transpose/eigenvalues/add/subtract, passing matrices as JSON strings (`"[[1,2],[3,4]]"`), not native arrays. For a one-off matrix expression embedded in a larger calculation, `evaluate("det([[1,2],[3,4]])")` is faster than a separate tool call.

### 4. Statistics

```
statistics(operation, data)
```

Pass the dataset as a JSON-string array (`"[1,2,3,4,5]"`) for mean/median/mode/std/variance/min/max/sum/product. Note that `mode` returns an **array** even when there is a single mode (`[value]`) — don't unwrap it as a scalar.

### 5. Unit conversion

```
unit_conversion(value, target_unit)
```

Use compound unit forms for rates — `mi/h`, `km/h`, `m/s` — not the informal shorthands. See the gotcha below.

## Correct-usage gotchas

These are usage-correctness notes, not safety rails — nothing in `math-mcp` is destructive, so there is nothing here to confirm before running.

- **Symbolic vs. numeric in `evaluate`** — mixing a symbolic term with a numeric one in the same call (e.g. `sqrt(16) + derivative(x^2, x)`) throws **`Undefined symbol x`**: the symbolic part (`x` in the derivative) leaves a free variable the numeric part can't resolve. Keep symbolic and numeric expressions in separate calls, or supply `scope` so every symbol has a value. Confirmed live: this exact expression raises `Undefined symbol x`.
- **Pass a point via `scope`** — `evaluate("2*x", scope={x: 5})` rather than string-substituting the value into the expression yourself.
- **JSON-string inputs** — `matrix_operations` matrices and `statistics` data are **strings** containing JSON arrays (`"[[1,2],[3,4]]"`, `"[1,2,3]"`), not native arrays. Passing a real array/object instead of its JSON-string form will not work.
- **Units** — use `mi/h`, `km/h`, `m/s`; `mph`/`kph`/`knot` are rejected. Confirmed live: `unit_conversion(value="60 mi/h", target_unit="mph")` errors with `Unit "mph" not found.`, while `target_unit="km/h"` succeeds (`96.56063999999999 km / h`).
- **Results may be strings** — `evaluate` can return a string (e.g. `"60"`); parse it if a downstream step needs a number rather than text.
- **mathjs syntax** — `^` for powers, function-call forms (`det(...)`, `sqrt(...)`), explicit `*` for multiplication (no implicit juxtaposition).
