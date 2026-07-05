# `math` Skill — Design

## Goal

Ship a guidance/playbook **skill** inside the `math-mcp` plugin — named `math`
(slash `/math`, loads as `math-mcp:math`) — that gives Claude the judgment to
use the server's 7 pure computation tools well: **when to offload computation to
the tool instead of doing mental math**, which tool to reach for (`evaluate` vs.
the six specialized tools), how to compose them into common workflows, and the
mathjs-syntax gotchas that trip up first attempts. It mirrors the `windows` and
`dropbox` companion skills; guidance only, no scripts (the 7 tools are atomic and
Claude calls them directly).

## Motivation

`math-mcp` currently ships only the server, yet its own `plugin.json` description
already advertises "+ /math command" — a trigger that does not exist. This skill
fulfills that. More importantly, math is the one domain where Claude routinely
produces confident-but-wrong answers (arithmetic slips, dropped signs, bad matrix
algebra). A companion skill whose core rule is **"offload real computation to the
tool"** directly reduces that failure mode, the same way the `windows` skill steers
Claude to the MCP over ad-hoc PowerShell.

The skill is **judgment, not new capability** — it adds no tools and no scripts.

## Non-Goals

- No helper scripts. The 7 tools are atomic and orchestrated directly by Claude;
  there is no bulk/multi-step operation the tools can't express (unlike dropbox sync).
- No new tools, no server/mathjs code changes, no rebuild of the bundle.
- Not a mathjs manual — the skill maps the 7 tools to workflows and flags the
  handful of syntax gotchas, not every mathjs function.

## Placement & Load Model

```
math-mcp/
  skills/
    math/
      SKILL.md     # the playbook (frontmatter + body)
      README.md    # short human-facing overview
```

- The plugin auto-discovers `skills/<name>/SKILL.md`; frontmatter `name: math`
  sets the load id `math-mcp:math` and slash `/math`.
- No `marketplace.json` or `settings.json` edits — the plugin is already enabled.
  Delivery: commit to the repo → `/plugin marketplace update local-marketplace`
  → `/reload-plugins` (fresh re-clone lands the skill).
- Repo default branch is `master` (direct-push, like the other `*-mcp` repos).

## The 7 tools (source of truth — grounded against live schemas)

| Tool | Signature | Purpose |
|---|---|---|
| `evaluate` | `expression`, `scope?` | General mathjs eval: arithmetic, algebra, calculus, matrices. Ex: `2+2`, `sqrt(16)`, `derivative(x^2, x)`, `det([[1,2],[3,4]])`. `scope` supplies variables, e.g. `{x: 5}`. |
| `derivative` | `expression`, `variable` | Symbolic d/d(var). `derivative("x^2","x") → "2*x"`. |
| `solve` | `equation`, `variable` | Solve an equation. `solve("x^2 - 4 = 0","x")`. |
| `simplify` | `expression`, `rules?` | Symbolic simplify. `"2*x + x" → "3*x"`. |
| `matrix_operations` | `operation`, `matrix_a`, `matrix_b?` | Matrix algebra. `operation ∈ {multiply, inverse, determinant, transpose, eigenvalues, add, subtract}`. Matrices are **JSON strings**: `matrix_a="[[1,2],[3,4]]"`. WASM-accelerated 10×10+. |
| `statistics` | `operation`, `data` | Dataset stats. `operation ∈ {mean, median, mode, std, variance, min, max, sum, product}`. `data` is a **JSON string**: `"[1,2,3,4,5]"`. `mode` returns an **array**. WASM-accelerated 100+. |
| `unit_conversion` | `value`, `target_unit` | Dimensional conversion. `value="5 inches"`, `target_unit="cm"`. Use compound forms (`mi/h`, `km/h`); `mph`/`kph`/`knot` are NOT recognized (mathjs limitation). |

## SKILL.md Structure

### 1. Frontmatter
- `name: math`
- `description:` a trigger-rich paragraph in the `windows`/`dropbox` style —
  natural-language triggers ("evaluate this expression", "differentiate…",
  "solve for x", "simplify…", "multiply/invert these matrices",
  "determinant/eigenvalues", "mean/median/std of…", "convert X to Y units",
  "compute this exactly"), and what it does NOT cover (it is guidance over the
  `math-mcp` server; not a plotting/graphing tool; not a proof assistant).

### 2. The offload rule (core message)
Non-trivial computation → call `math-mcp`, don't mental-math. Spell out the
boundary: trivial inline arithmetic (`2+2`, a single-digit product) is fine to
answer directly; but **exact/CAS results, calculus, any matrix beyond a 2×2 by
hand, statistics over a dataset, unit conversions, and any figure a user will
rely on** go to the tool — self-computed math is error-prone. Frame it as the
analog of "prefer the MCP over ad-hoc work."

### 3. `evaluate` vs. the 6 specialized tools
The overlap is intentional: `evaluate` is the mathjs workhorse and can express
`derivative(...)`, `det(...)`, etc. inline. Guidance:
- Reach for `evaluate` for a **one-off general expression** or when combining
  several operations in one formula (supply `scope` for variable values).
- Reach for the **specialized tool** when you want its focused, validated result
  or its specific op: `derivative` (clean symbolic d/dx), `solve` (roots),
  `simplify` (reduce), `matrix_operations` (typed matrix ops with an op enum),
  `statistics` (dataset reductions), `unit_conversion` (dimensional).
- Include the tool table from the section above.

### 4. Workflow playbooks (five)
1. **Solve-and-verify** — `solve(eq, x)` → for each root, `evaluate(eq_LHS, scope={x: root})` and confirm it is ~0. Do not report roots unverified.
2. **Calculus pipeline** — `derivative(expr, x)` → `simplify` the result → `evaluate` at a point via `scope` for a number.
3. **Matrix pipeline** — `matrix_operations(op, matrix_a[, matrix_b])` with JSON-string matrices (`"[[…],[…]]"`) for multiply/inverse/determinant/transpose/eigenvalues/add/subtract; use `evaluate("det([[…]])")` for one-off expressions.
4. **Statistics** — `statistics(op, data)` with a JSON-string array for mean/median/mode/std/variance/min/max/sum/product; remember `mode` returns an array.
5. **Unit conversion** — `unit_conversion(value, target_unit)` using compound unit forms.

### 5. Correct-usage gotchas (the "rails" analog — usage-correctness, not safety; nothing here is destructive)
- **Symbolic vs. numeric in `evaluate`** — mixing a symbolic term with a numeric
  one (e.g. `sqrt(16) + derivative(x^2, x)`) throws **"Undefined symbol x"**
  because the symbolic part leaves a free variable. Keep symbolic and numeric
  separate, or supply `scope` to make it numeric.
- **Pass a point via `scope`** (`evaluate("2*x", scope={x: 5})`) rather than
  string-substituting into the expression.
- **JSON-string inputs** — `matrix_operations` matrices and `statistics` data are
  **strings** containing JSON arrays (`"[[1,2],[3,4]]"`, `"[1,2,3]"`), not native
  arrays.
- **Units** — use `mi/h`, `km/h`, `m/s`; `mph`/`kph`/`knot` are rejected.
- **Results may be strings** — `evaluate` can return a string (`"60"`); parse if
  you need a number for a downstream step.
- **mathjs syntax** — `^` for powers, function-call forms (`det(...)`,
  `sqrt(...)`), `*` explicit for multiplication.

## README.md

A short human-facing overview: what the skill is (a playbook over the `math-mcp`
server), how it loads (`math-mcp:math`, `/math`), a one-line list of the five
workflows, the offload rule in one sentence, and a pointer to `SKILL.md`. No
duplication of the SKILL body. No version/date.

## Release

- Bump `math-mcp` **plugin minor**: `.claude-plugin/plugin.json` `4.1.3 → 4.2.0`
  (this is what `/plugin marketplace update` keys on to pull the new skill).
- **Do NOT change `package.json` (4.1.3), the server `ServerInfo` version, or the
  bundle** — no code changed, no rebuild; the running server legitimately keeps
  reporting 4.1.3. (Same principle as windows-mcp holding its binary at 0.4.1 for
  a skill-only release.)
- Update repo `README.md` (note the plugin now ships a `math` skill / `/math`) and
  `CHANGELOG.md` (`## [4.2.0]` entry, Keep-a-Changelog; scoped to the skill,
  explicitly noting the server binary is unchanged).
- Atomic commit; push to `master`.
- Deliver: `/plugin marketplace update local-marketplace` + `/reload-plugins`.

## Success Criteria

1. `skills/math/SKILL.md` and `README.md` exist; frontmatter `name: math`.
2. SKILL.md contains the offload rule, the `evaluate`-vs-specialized guidance, the
   7-tool table, the five workflow playbooks, and the gotchas — no placeholders.
3. The 7-tool table matches the live server's tool list and signatures (verified
   via `ToolSearch`, not assumed).
4. `plugin.json` = 4.2.0; `package.json` + bundle unchanged at 4.1.3; README +
   CHANGELOG updated; committed atomically and pushed to `master`.
5. After marketplace update + reload, the skill loads as `math-mcp:math` and
   `/math` triggers it (final verification).

## Testing

Documentation artifact — "tests" are verification, not unit tests:
- **Frontmatter validity**: skill parses and appears in the skills list after reload.
- **Tool-set accuracy**: cross-check the 7-tool table against `ToolSearch`
  `mcp__plugin_math-mcp_math-mcp__*` — every tool present, signatures correct.
- **No broken claims**: every gotcha traces to real tool behavior — the
  "Undefined symbol x" case was observed live this session; the `mph`/`kph`
  rejection, JSON-string inputs, and op enums come from the live tool schemas.
  Verify with `honest-claude` (and the plan should confirm the `mph` behavior
  with a live call rather than restating the schema).
- **Load verification**: after release, confirm `math-mcp:math` is in the reloaded
  skills list.
