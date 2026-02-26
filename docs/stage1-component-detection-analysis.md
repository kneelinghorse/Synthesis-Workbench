# Stage1 Component Detection Analysis (Sprint 8)

## Objective

Evaluate Stage1 DOM component detection output from `inspect_app` with `components: true` and determine usefulness for Synthesis Workbench composition.

## Runs executed

Date: 2026-02-15 (UTC)

| Site | Run ID | Fixture Path |
|---|---|---|
| `example.com` | `a962411c-ae5e-4fc9-bbba-90edac3b0d01` | `test/fixtures/stage1-component-analysis/corpus/stage1/example-com-components-s8/a962411c-ae5e-4fc9-bbba-90edac3b0d01` |
| `neverssl.com` | `fdcbf5ab-a218-4a73-acbc-f6247caeb7d4` | `test/fixtures/stage1-component-analysis/corpus/stage1/neverssl-components-s8/fdcbf5ab-a218-4a73-acbc-f6247caeb7d4` |

Both runs were produced with:

- `stage1_inspect_app`
- `components: true`
- `crawlDepth: 1`

## Observed artifact output

Both runs produced:

- `app_profile.json`
- `style_fingerprint.json`
- `ia_outline.json`
- `a11y_report.json`
- `perf_report.json`
- `baseline_metrics.json`
- `report-index.json`

Both runs did **not** produce:

- `component_clusters.json`
- any report-index entry with `type: "component_clusters"`

## Component cluster format (when available)

A prior Stage1 run fixture (`../Stage1/test-out-clusters-2/.../component_clusters.json`) shows expected `v1.1.0` structure:

- top-level: `kind`, `version`, `run_id`, `generated_at`, `clusters`, `summary`
- cluster entry fields seen in real output: `clusterId`, `patternName`, `tagName`, `selectors.css`, `totalInstances`, `confidence`

Workbench ingest already supports these schema variants.

## Usefulness assessment

Current `inspect_app` output (from these two runs) provides useful route/style/perf context but no component cluster data for composition decisions.

Impact:

1. Workbench cannot infer reusable component candidates from Stage1 app scans.
2. Composition guidance still depends on manually provided component catalogs or Foundry-side structured data.
3. `/bundle` ingest remains functional but yields no component enrichment from DOM detection in these runs.

## Gap analysis

What Workbench needs from Stage1 producer:

1. Consistent emission of `component_clusters.json` when `components: true`.
2. `report-index.json` entries with explicit `type: "component_clusters"` and artifact path.
3. Stable cluster fields for composition scoring:
   - name/pattern (`patternName` or `name`)
   - instance frequency (`totalInstances`/`count`)
   - confidence
   - selectors and parent/variant relationships

## Recommendation

Short term:

1. Keep Workbench cluster parsing compatibility as-is (already supports current known schema variants).
2. Treat component detection as optional enrichment and do not block ingest flow when cluster artifact is absent.

Stage1 producer follow-up:

1. Verify `components: true` wiring in `inspect_app` pipeline.
2. Ensure component detection pass is registered in manifest `passes`.
3. Emit and index `component_clusters.json` for app runs by default when enabled.
