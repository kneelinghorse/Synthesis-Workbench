# Sprint-13 Fragment Rollout and Rollback

## Current Deployment Posture (2026-02-27)
- Fragment adapter is the **sole** Foundry rendering path (sprint-16 migration).
- `composition` mode is a compatibility alias to fragment rendering.
- `full-document` adapter was **removed** in sprint-16 (s16-m03).
- Contract gate status: **CONDITIONAL GO** (`docs/verification/s13-fragment-adoption-gate.md`).
- Static renderer remains as offline fallback when Foundry is unavailable or fragment contract fails.

## Mode Controls
- Fragment mode is always used. The `NEXT_PUBLIC_PREVIEW_RENDERER_MODE` env var is no longer read.
- Allowed modes:
  - `fragments`: default, uses fragment adapter.
  - `composition`: deprecated alias, also uses fragment adapter.

## Verification
1. Verify contract gate:
   - `pnpm verify:foundry-fragments`
2. Confirm no elevated preview errors in runtime logs.

## Rollback Note
Full-document rollback is no longer available. If fragment rendering fails, the static
renderer is used as the fallback (produces `data-static-preview="true"` markers, `dry-run` status).

## Known Constraint
- Foundry unknown-component behavior can still produce global-failure semantics.
- Workbench mitigation is active: fragment requests are pre-validated via `repl.validate` before `repl.render`.
