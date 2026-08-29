# TODO — math-mcp

Open work for this repo. Landed changes are described in [`CHANGELOG.md`](CHANGELOG.md); this file
holds only what is still outstanding.

## Open

- [x] **Confirm the nightly `schedule` on `ci.yml` actually fires.** — **VERIFIED 2026-08-29**:
  first scheduled run fired at 07:06:45Z, conclusion `success`, event `schedule`. Closed by
  behaviour rather than by syntax. Added 2026-08-28 (`4d8f2d3`) at 07:00 UTC to cover auto-merged
  Dependabot commits, which GitHub's recursion guard leaves with no `on: push` run — two such
  commits were measured in this repo's history (`3904d585`, `932b6f70`), and both stay permanently
  ungauged since they predate the `workflow_dispatch` trigger.

## Five-axis assessment — 2026-08-28

Per the workspace standing mandate, recorded so a later reader can see what was assessed and what
was deliberately left.

| Axis | Assessed | Left |
|---|---|---|
| Speed | not touched this pass | — |
| Stability | CI green on `master`; no flaky-by-design tests observed | not investigated in depth |
| Reliability | **fixed** — `master` could carry an auto-merged commit with no CI run at all; nightly `schedule` + `workflow_dispatch` added | `3904d585` and `932b6f70` stay permanently ungauged; they predate the `workflow_dispatch` trigger, so no workflow can be run against them |
| Security | advisory audit clean (2026-08-28, `npm audit --package-lock-only`); no publish job, no `NPM_TOKEN`, third-party actions SHA-pinned | — |
| Maintainability | this repo's auto-merge workflow is named `dependabot-automerge.yml` while others use `dependabot-auto-merge.yml` — a name-based fleet sweep silently misses half the repos | **not renamed**: renaming a workflow changes its check name, which would break any branch-protection context that references it. Needs the contexts updated in the same change, so it is not a drive-by fix |
