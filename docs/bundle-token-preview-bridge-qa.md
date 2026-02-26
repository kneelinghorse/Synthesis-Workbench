# Bundle -> Token -> Preview Bridge QA (Sprint 8)

Date: 2026-02-15 (UTC)

## Scope

Validated the end-to-end token propagation chain:

1. Stage1 bundle ingest
2. Token extraction
3. Token seeding into `TokenState`
4. CSS variable serialization
5. Preview message payload generation
6. Preview iframe CSS variable application updates

## Test coverage added

- `test/integration/bundle-token-preview-bridge.test.ts`
  - Multi-site corpus validation (`example.com`, `neverssl.com`, `info.cern.ch`)
  - Verifies extracted token paths map to preview CSS variable names
  - Verifies token updates propagate into preview payloads
  - Verifies stale custom CSS vars are removed after token reset
- `src/components/workbench/PreviewPane.test.ts`
  - Confirms preview srcDoc includes stale CSS var removal logic

## Bridge hardening

- `src/lib/preview/inject-script.ts`
  - Added tracked CSS var set in iframe script
  - On each `TOKEN_STATE_UPDATE`, stale vars are removed via `root.style.removeProperty(...)`
  - Prevents stale custom vars after token state resets

## Result

All QA checks pass with diverse bundle data, and token-to-preview synchronization now guards against stale CSS variables in the iframe bridge.
