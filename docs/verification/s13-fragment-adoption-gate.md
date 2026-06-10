# Sprint-13 Fragment Contract Adoption Gate

## Run Metadata
- Date: 2026-06-10
- Foundry endpoint: `http://127.0.0.1:4466/run`
- Live probes required: yes
- Live probes executed: yes
- Gate decision: **GO**

## Contract Harness Results

| Case | Source | Status | Isolation Mode | Fragments | Errors | Failed Checks |
| --- | --- | --- | --- | ---: | ---: | --- |
| recorded-fragments-global-failure | fixture | PASS | global-failure | 0 | 1 | none |
| recorded-fragments-partial-isolated | fixture | PASS | isolated | 1 | 1 | none |
| recorded-fragments-success | fixture | PASS | none | 2 | 0 | none |
| live-fragments-success | live | PASS | none | 2 | 0 | none |
| live-fragments-isolation-probe | live | PASS | isolated | 1 | 1 | none |
| live-fragments-strict-probe | live | PASS | global-failure | 0 | 1 | none |

## Adapter Switch Guidance

- Fragment isolation probe mode: isolated
- Adapter switch can proceed once feature-flag rollout controls are in place.

## Notes

- This harness validates payload shape, deterministic fragment IDs, wrapper-free fragment HTML, and observed error-isolation semantics.
- Fixture checks use recorded contract payloads under `test/fixtures/foundry-fragment-contract`.
