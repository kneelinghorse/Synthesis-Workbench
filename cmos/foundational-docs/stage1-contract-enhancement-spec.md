# Stage1 Contract Enhancement Spec

## Purpose
Streamline Stage1 → Workbench integration by standardizing token guesses, component clusters, and project linkage in Stage1 outputs. This enables direct ingestion into TokenState and Workbench bundle loading without manual transforms.

## Requested Enhancements (Summary)
1. **Token Guess Artifact**: Provide `token-guess.json` with TokenState-compatible dot paths.
2. **Manifest Project Link**: Add `project_id` to `manifest.json` for cross-tool correlation.
3. **Component Clusters Artifact**: Provide `component_clusters.json` with confidence, selectors, and nesting.

---

## 1) `token-guess.json` Format
**Goal**: Allow Workbench to ingest token guesses with no remapping.

### Required fields
- `kind`: `"token_guess"`
- `version`: `"1.0.0"`
- `generated_at`: ISO 8601 timestamp
- `tokens`: flat map of TokenState paths to CSS values

### Token path rules
- Use dot-paths aligned with Workbench TokenState structure.
- Examples: `colors.primary`, `typography.fontFamily.sans`, `spacing.md`.

### Example
```json
{
  "kind": "token_guess",
  "version": "1.0.0",
  "generated_at": "2026-01-08T17:15:31.304Z",
  "tokens": {
    "colors.primary": "#111111",
    "colors.secondary": "#222222",
    "colors.background": "#ffffff",
    "typography.fontFamily.sans": "Inter, system-ui, sans-serif",
    "typography.fontFamily.mono": "JetBrains Mono, monospace",
    "spacing.sm": "0.5rem",
    "spacing.md": "1rem",
    "radius.md": "0.375rem"
  }
}
```

---

## 2) `manifest.json` Enhancement
**Goal**: Tie Stage1 runs to Workbench projects for tracking and retrieval.

### Required field
- `project_id`: string

### Example
```json
{
  "run_id": "05a00c1f-63a7-4367-be79-5a2467b7f99d",
  "project_id": "synthesis-workbench",
  "mode": "surface",
  "targets": [
    {
      "name": "example.com",
      "url": "https://example.com/"
    }
  ],
  "environment": {
    "timestamp": "2026-01-08T17:15:29.324Z",
    "stage": "production"
  }
}
```

---

## 3) `component_clusters.json` Format
**Goal**: Provide component detection data in a predictable shape for Workbench component ingestion.

**Recommendation**: Implement **v1.1.0** directly. The enhanced fields (confidence, multiple selectors, nesting) provide significantly better Workbench integration with minimal additional effort.

### Required fields (v1.1.0)
Top-level:
- `kind`: `"component_clusters"`
- `version`: `"1.1.0"`
- `generated_at`: ISO 8601 timestamp
- `clusters`: array of component cluster entries

Cluster entry:
- `name`: component or cluster label
- `count`: number of instances
- `confidence`: detection confidence score (0.0-1.0)
- `selectors`: object with selector variants (see below)
- `parent_cluster`: parent cluster name or `null`
- `variants`: array of detected variant names

### Example (v1.1.0 - Recommended)
```json
{
  "kind": "component_clusters",
  "version": "1.1.0",
  "generated_at": "2026-01-08T17:15:31.304Z",
  "clusters": [
    {
      "name": "Button",
      "count": 12,
      "confidence": 0.92,
      "selectors": {
        "css": "button, .btn, .Button",
        "testId": "[data-testid*='button']",
        "role": "[role='button']"
      },
      "parent_cluster": null,
      "variants": ["primary", "secondary", "ghost"]
    },
    {
      "name": "Card",
      "count": 6,
      "confidence": 0.85,
      "selectors": {
        "css": ".card, [data-component='card']"
      },
      "parent_cluster": null,
      "variants": []
    }
  ]
}
```

---

## Detailed Specifications

### Token Path Vocabulary

**Q: Is the token path vocabulary fixed or extensible?**

The vocabulary is **semi-fixed with extensibility**:

| Category | Fixed Paths | Notes |
|----------|-------------|-------|
| `colors.*` | primary, secondary, accent, background, surface, border, text.*, status.* | Core palette |
| `typography.*` | fontFamily.sans/mono, fontSize.xs-3xl, fontWeight.*, lineHeight.* | Type scale |
| `spacing.*` | xs, sm, md, lg, xl, 2xl | Spacing scale |
| `radius.*` | none, sm, md, lg, full | Border radius |
| `shadow.*` | sm, md, lg | Box shadows |
| `custom.*` | Any key | **Extensibility bucket** |

**Stage1 should:**
1. Emit known paths when detected values map to standard categories
2. Use `custom.<descriptive-key>` for anything outside the fixed vocabulary

**Workbench behavior for unknown paths:**
- Paths starting with known categories but unknown keys → stored in `custom` with full path as key
- Example: `shadows.xl` (unknown) → `custom["shadows.xl"]`
- No errors thrown; best-effort ingestion with warning logged

### Project ID Lifecycle

**Q: Where does `project_id` originate?**

**Origin (in priority order):**
1. **CLI flag**: `--project-id=<id>` passed to Stage1 (explicit, recommended)
2. **suite.yaml**: `project_id` field in suite configuration
3. **Auto-generated**: If neither provided, Stage1 generates `stage1-<hostname>-<date>` format

**Validation:**
- `project_id` is treated as an opaque string by Stage1
- Workbench uses it for filtering/grouping runs, not strict validation
- Missing `project_id` → runs appear as "unlinked" in BundlePicker

**Example CLI usage:**
```bash
stage1 inspect --url https://example.com --project-id my-workbench-project
```

### Component Clusters Selector Types

**Selector types:**
- `css`: Standard CSS selector (always present, required)
- `testId`: data-testid pattern (optional, preferred for stability)
- `role`: ARIA role selector (optional)

**Confidence scoring:**
- `0.0 - 1.0` range
- Based on: visual similarity, DOM structure patterns, naming conventions
- Workbench can filter clusters below threshold (default: 0.7)

**Nesting:**
- `parent_cluster`: References another cluster name, or `null` for top-level
- Enables Workbench to show component hierarchy

### report-index.json Contract

**Existing format confirmed.** Stage1 already produces this. New artifacts should be added:

```json
{
  "kind": "report_index",
  "version": "1.0.0",
  "run_id": "da21fa37-586b-4386-9103-cbbcf969f674",
  "generated_at": "2026-01-08T17:16:43.321Z",
  "artifacts": [
    {
      "type": "token_guess",
      "path": "token-guess.json",
      "description": "TokenState-compatible token guesses.",
      "metadata": { "bytes": 512, "modified_at": "..." }
    },
    {
      "type": "component_clusters",
      "path": "component_clusters.json",
      "description": "Detected UI component clusters with selectors.",
      "metadata": { "bytes": 1024, "modified_at": "..." }
    }
  ]
}
```

**Discovery contract:**
- Workbench fetches `report-index.json` first
- Looks up artifact by `type` field
- Falls back to direct path if report-index unavailable

### Target Attribution (Multi-Target Mode)

**Q: Per-target or aggregate artifacts?**

**Per-target with namespacing:**

In suite/multi-target mode, artifacts are **per-target** with `target_id` attribution:

```
out/stage1/{suite-name}/{run_id}/
├── manifest.json              # Suite-level manifest
├── targets/
│   ├── example.com/
│   │   ├── token-guess.json
│   │   ├── component_clusters.json
│   │   └── style_fingerprint.json
│   └── app.example.com/
│       ├── token-guess.json
│       ├── component_clusters.json
│       └── style_fingerprint.json
└── artifacts/
    └── report-index.json      # Aggregate index with target attribution
```

**Aggregate report-index.json for multi-target:**
```json
{
  "kind": "report_index",
  "version": "1.1.0",
  "run_id": "...",
  "mode": "suite",
  "targets": [
    {
      "target_id": "example.com",
      "artifacts": [
        { "type": "token_guess", "path": "targets/example.com/token-guess.json" }
      ]
    },
    {
      "target_id": "app.example.com",
      "artifacts": [
        { "type": "token_guess", "path": "targets/app.example.com/token-guess.json" }
      ]
    }
  ]
}
```

**Workbench behavior:**
- Single-target mode: Load artifacts directly from `artifacts/`
- Multi-target mode: BundlePicker shows target selector, loads per-target artifacts

---

## Integration Notes
- Workbench can ingest `token-guess.json` directly into TokenState when the `tokens` map uses dot paths.
- Unknown token paths are stored in `custom.*` bucket with warning logged.
- `component_clusters.json` should be listed in `report-index.json` for automatic discovery.
- `project_id` in `manifest.json` enables cross-tool linking and filtering in BundlePicker.
- Multi-target runs use per-target artifact directories with aggregate report-index.

## Sample Files
Reference examples:
- `cmos/foundational-docs/examples/token-guess.json`
- `cmos/foundational-docs/examples/component_clusters.json`
