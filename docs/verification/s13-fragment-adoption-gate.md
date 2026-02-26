# Sprint-13 Fragment Contract Adoption Gate

## Run Metadata
- Date: 2026-02-26
- Foundry endpoint: `http://127.0.0.1:4466/run`
- Live probes required: yes
- Live probes executed: yes
- Gate decision: **CONDITIONAL GO**

## Contract Harness Results

| Case | Source | Status | Isolation Mode | Fragments | Errors | Failed Checks |
| --- | --- | --- | --- | ---: | ---: | --- |
| recorded-fragments-global-failure | fixture | PASS | global-failure | 0 | 1 | none |
| recorded-fragments-partial-isolated | fixture | PASS | isolated | 1 | 1 | none |
| recorded-fragments-success | fixture | PASS | none | 2 | 0 | none |
| live-fragments-success | live | PASS | none | 2 | 0 | none |
| live-fragments-isolation-probe | live | PASS | global-failure | 0 | 1 | none |
| live-fragments-strict-probe | live | PASS | global-failure | 0 | 1 | none |

## Adapter Switch Guidance

- Fragment isolation probe mode: global-failure
- Adapter switch may proceed only with component pre-validation enabled before fragment requests.

## Notes

- This harness validates payload shape, deterministic fragment IDs, wrapper-free fragment HTML, and observed error-isolation semantics.
- Fixture checks use recorded contract payloads under `test/fixtures/foundry-fragment-contract`.
