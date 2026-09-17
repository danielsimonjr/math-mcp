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

- [ ] **Two tests fail on `master` for wall-clock and ordering reasons, not logic.** `bun test`
      reports `(fail) Health Checks > Multiple health check calls > should update uptime between
      calls` (asserts after a real 5,000 ms wait) and `(fail) expression-cache > LRUCache > LRU
      eviction > should update LRU order on access`. Confirmed PRE-EXISTING: both fail identically
      at `fa45fbe`, before the `plugin/` move (8 failures there, 7 now). A wall-clock sleep in an
      assertion is flaky by design; fix the uptime test with an injected clock rather than a wait,
      and establish whether the LRU test or the LRU implementation is wrong before changing either.
      _Found 2026-09-17 while verifying the plugin/ restructure; recorded rather than silently passed over._
