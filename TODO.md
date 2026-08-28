# TODO — math-mcp

Open work for this repo. Landed changes are described in [`CHANGELOG.md`](CHANGELOG.md); this file
holds only what is still outstanding.

## Open

- [ ] **Confirm the nightly `schedule` on `ci.yml` actually fires.** Added 2026-08-28 (`4d8f2d3`) at
  07:00 UTC to cover auto-merged Dependabot commits, which GitHub's recursion guard leaves with no
  `on: push` run — two such commits were measured in this repo's recent history (`3904d585`,
  `932b6f70`). The trigger is in place and the YAML validates, but **no scheduled run has happened
  yet.** The gap is not closed until one lands; verifying the syntax is not verifying the behaviour.

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
