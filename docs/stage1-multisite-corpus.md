# Stage1 Multi-Site Corpus (Sprint 8)

This corpus is used to regression-test Stage1 bundle ingestion across multiple real websites.

## Capture metadata

- Capture date: 2026-02-15 (UTC)
- Capture method: `stage1_inspect_surface`
- Fixture root: `test/fixtures/stage1-multisite/corpus/stage1`

## Included runs

| Site | Run ID | Fixture Path | Notes |
|---|---|---|---|
| `example.com` | `0170e664-baf5-47f4-bbce-e4ad61f5ab11` | `test/fixtures/stage1-multisite/corpus/stage1/example-com-s8/0170e664-baf5-47f4-bbce-e4ad61f5ab11` | Normal surface run with `report-index.json` and `style_fingerprint.json`. |
| `neverssl.com` | `5e8a7771-6de8-4575-8827-1dfc1251843d` | `test/fixtures/stage1-multisite/corpus/stage1/neverssl-com-s8/5e8a7771-6de8-4575-8827-1dfc1251843d` | Normal surface run with richer typography/spacing fingerprint values. |
| `info.cern.ch` | `52a5463d-ac13-4d07-9e66-fe85eb2eaa52` | `test/fixtures/stage1-multisite/corpus/stage1/info-cern-ch-s8/52a5463d-ac13-4d07-9e66-fe85eb2eaa52` | Normal surface run with minimal classic HTML styles. |
| `www.iana.org` | `4648cec9-d652-4ffd-8f4e-d5d50e38271a` | `test/fixtures/stage1-multisite/corpus/stage1/iana-org-s8/4648cec9-d652-4ffd-8f4e-d5d50e38271a` | Partial run: `web.crawl` failed, but artifact extraction still produced ingestible bundle data. |

## Edge cases captured

1. Partial execution with failed passes:
   - `manifest.passes` can contain failures and sparse `inputs`.
   - Bundle ingestion still needs to succeed if token-bearing artifacts are present.
2. Report-index target identifier variance:
   - Stage1 reports may use `target_id`, `id`, `name`, or URL-like identifiers.
   - Bundle loader now normalizes and matches these forms against run hostname.
3. Unexpected report-index shape and missing artifacts:
   - `artifacts`/`targets` can be malformed (non-array) in partial or bridge-transformed payloads.
   - Loader now guards and falls back instead of throwing.
   - If report-index and fallback artifacts are all missing, loader returns a manifest-only bundle.

## Scope of stored fixtures

Only compact JSON artifacts required for ingestion tests are stored:

- `manifest.json`
- `artifacts/report-index.json` (when present)
- `artifacts/style_fingerprint.json` (when present)
- `artifacts/surface_snapshot.json` (when present)
- `artifacts/baseline_metrics.json` (when present)

Large evidence payloads (screenshots/traces) are intentionally excluded.
