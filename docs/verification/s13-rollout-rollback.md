# Sprint-13 Fragment Rollout and Rollback

## Current Deployment Posture (2026-02-26)
- Fragment adapter is implemented behind `PreviewRenderer`.
- `composition` mode is now a compatibility alias to fragment rendering.
- `full-document` mode remains available as rollback.
- Contract gate status: **CONDITIONAL GO** (`docs/verification/s13-fragment-adoption-gate.md`).
- Parity status on baseline templates (`dashboard`, `form-page`, `landing-page`): **PASS** (`docs/verification/s13-fragment-parity.md`).

## Mode Controls
- Primary flag: `NEXT_PUBLIC_PREVIEW_RENDERER_MODE` (client) / `PREVIEW_RENDERER_MODE` (server).
- Allowed values:
  - `fragments`: uses fragment adapter.
  - `composition`: deprecated alias, also uses fragment adapter.
  - `full-document`: explicit rollback mode.

## Rollout Guidance
1. Set `NEXT_PUBLIC_PREVIEW_RENDERER_MODE=fragments` for production rollout.
2. Verify contract gate:
   - `pnpm verify:foundry-fragments`
3. Verify baseline parity:
   - `pnpm verify:fragment-parity`
4. Confirm no elevated preview errors in runtime logs.

## Rollback Procedure
1. Change mode flag to `full-document`:
   - `NEXT_PUBLIC_PREVIEW_RENDERER_MODE=full-document`
2. Redeploy/restart Workbench app.
3. Re-run verification for regression tracking:
   - `pnpm verify:fragment-parity` (documents divergence, if any)
4. Keep fragment harness artifacts for root-cause analysis:
   - `docs/verification/s13-fragment-adoption-gate.md`
   - `docs/verification/s13-fragment-parity.md`

## Known Constraint
- Foundry unknown-component behavior can still produce global-failure semantics.
- Workbench mitigation is active: fragment requests are pre-validated via `repl.validate` before `repl.render`.
