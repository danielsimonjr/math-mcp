# math

Playbook for computing with the `math-mcp` server's 7 pure-math tools — expression evaluation, derivatives, equation solving, simplification, matrix algebra, statistics, and unit conversion.

## Purpose

A judgment layer over the `math-mcp` server's 7 tools for pure computation. This skill adds no tools of its own—every action composes existing MCP tools into correct workflows with the right input shapes and validation. It steers you toward the tool instead of mental math, helps pick `evaluate` vs. a specialized tool, sequences multi-step operations correctly, and flags the mathjs-compatible syntax gotchas that produce wrong results.

**The offload rule:** Non-trivial computation goes to `math-mcp`, not mental math—call the tool instead of estimating or working out calculations by hand.

Supports five core workflows:
- **Solve-and-verify** — solve equations, substitute roots back to confirm
- **Calculus pipeline** — differentiate symbolically, simplify, evaluate at a point
- **Matrix pipeline** — multiply, invert, determinant, transpose, eigenvalues
- **Statistics** — mean, median, mode, standard deviation, variance over datasets
- **Unit conversion** — convert between compound units (mi/h, km/h, m/s)

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | Full playbook: the offload rule, tool selection, workflow recipes, gotchas |
| `README.md` | This overview |

## Triggers

Loads as `math-mcp:math`; explicit slash trigger: `/math`.

Auto-loads on queries mentioning evaluation, derivatives, equation solving, simplification, matrix operations, statistics, or unit conversion (e.g., "evaluate this expression", "what is the derivative of", "solve for x", "multiply these matrices", "convert 5 miles to km").

## Scope

Pure computation only — no graphing/plotting, no proof assistant, no symbolic manipulation beyond MathTS. For full details on capabilities, limitations, and gotchas, see `SKILL.md`.
