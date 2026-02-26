# Sprint-13 Fragment Preview Parity Verification

## Run Metadata
- Date: 2026-02-26
- Foundry endpoint: `http://127.0.0.1:4466/run`
- Baseline templates: dashboard, form-page, landing-page
- Overall result: PASS

## Parity Table

| Template | Source components | Full markers | Fragment markers | Fragment wrappers | Full errors | Fragment errors | Full status | Fragment status | Fragment collapsed | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| dashboard | 7 | 17 | 14 | 7 | 0 | 0 | live | live | no | PASS |
| form-page | 8 | 18 | 11 | 8 | 0 | 0 | live | live | no | PASS |
| landing-page | 8 | 18 | 16 | 8 | 0 | 0 | live | live | no | PASS |

## Notes

- Fragment parity requires no fragment renderer errors, non-collapsed output, and wrapper coverage matching source component count.
- This validates adapter parity for sprint-13 baseline templates while full-document mode remains available as rollback.
