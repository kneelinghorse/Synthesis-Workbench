# Foundry Fragment API Handoff

## 1) Executive Summary and Urgency
Synthesis Workbench currently treats Foundry output as if it can be composed per component, but `repl.render` in apply mode returns a standalone HTML document. This contract mismatch is a primary candidate root cause for persistent preview collapse (minimal white page + single element/text instead of multi-component layout).  

This handoff defines the fragment API Foundry needs to deliver so Workbench can support durable compositional rendering long term while retaining a short-term full-document fallback.

This is a critical path integration request. Sprint-12 in Workbench is a go/no-go validation sprint. If short-term alignment still fails acceptance, project direction will be reconsidered.

## 2) Current Mismatch with Evidence and Symptom Profile
### Observed symptom profile
- Preview repeatedly collapses to a minimal white page with a single visible block.
- Expected multi-component template rendering is not consistently visible to users.
- Prior verification reported PASS but did not validate user-visible output quality.

### Evidence of contract mismatch
- Foundry `repl.render` apply mode emits full HTML document output (`<!DOCTYPE html>`, `<html>`, `<body>`).
- Workbench live path historically invoked render in a per-component composition flow.
- Verification scripts favored marker/error proxies over strict rendered-shape assertions.

### Impact
- Composition path can become invalid or visually unstable when full documents are treated as component fragments.
- Integration confidence is low without contract-level checks.

### Sprint-12 findings update (2026-02-26)
- Workbench now routes preview through a single renderer abstraction (`PreviewRenderer`) with `full-document` adapter as default.
- Live acceptance probe (full-document adapter) across `dashboard`, `form-page`, `landing-page` showed:
  - One Foundry `repl.render` call per template render cycle.
  - Full-document HTML returned (`<!DOCTYPE html>` present).
  - Non-collapsed output markers (`data-oods-component` counts: 17, 18, 18).
  - Zero renderer-level errors in the probe.
- Compatibility finding: Foundry bridge rejected `Grid` as an unknown component in the current registry; Workbench now maps grid layout nodes to Foundry-safe `Stack` containers while preserving grid intent in props (`layoutType`, `columns`, `gap`) as an interim compatibility bridge.
- Acceptance dependency linkage:
  - Technical evidence logged at `docs/verification/s12-go-no-go.md`.
  - CMOS mission `s12-m03` is blocked pending explicit user confirmation of material visual correctness before final go/no-go closure.

## 3) Non-Negotiable Requirements for Fragment API
1. Fragment response must never include `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>`.
2. Output must be keyed per requested node/component with deterministic IDs.
3. Per-fragment errors must be isolated, not fail the whole batch unless strict mode is explicitly requested.
4. Optional CSS payload must be scoped and deduplicatable.
5. Versioned schema and backward compatibility guarantees must be explicit.

## 4) Proposed API Contract (Input/Output and Invariants)
### Endpoint/Tool
- Tool name: `repl.render` (new fragment-capable mode), or `repl.render.fragments` if a distinct tool is preferred.
- Transport: MCP bridge `/run` and MCP JSON-RPC parity required.

### Input (proposed)
```json
{
  "mode": "full",
  "output": {
    "format": "fragments",
    "strict": false,
    "includeCss": true
  },
  "schema": {
    "version": "2025.11",
    "screens": [
      {
        "id": "screen-1",
        "component": "Stack",
        "children": [
          { "id": "dash-banner", "component": "Banner", "props": { "title": "Workbench Overview" } },
          { "id": "dash-tabs", "component": "Tabs", "props": { "activeTab": "overview" } }
        ]
      }
    ]
  }
}
```

### Output (proposed)
```json
{
  "status": "ok",
  "mode": "full",
  "output": { "format": "fragments", "strict": false },
  "dslVersion": "2025.11",
  "registryVersion": "x.y.z",
  "fragments": {
    "dash-banner": {
      "nodeId": "dash-banner",
      "component": "Banner",
      "html": "<section data-oods-component=\"Banner\">...</section>",
      "cssRefs": ["cmp.banner.base", "cmp.banner.info"]
    },
    "dash-tabs": {
      "nodeId": "dash-tabs",
      "component": "Tabs",
      "html": "<div data-oods-component=\"Tabs\">...</div>",
      "cssRefs": ["cmp.tabs.base"]
    }
  },
  "css": {
    "cmp.banner.base": "[data-oods-component=\"Banner\"]{...}",
    "cmp.tabs.base": "[data-oods-component=\"Tabs\"]{...}"
  },
  "errors": [],
  "warnings": []
}
```

### Invariants
1. Every requested renderable node appears in either `fragments` or `errors`.
2. `fragments[*].html` is fragment-only markup (no document wrapper tags).
3. Deterministic node keying: `fragments` keys must equal canonical node IDs.
4. `strict=false`: partial success allowed with isolated errors.
5. `strict=true`: any fragment error fails request with `status="error"` and no ambiguous mixed semantics.

## 5) Compatibility and Migration Strategy
### Phase A (short-term, already in progress on Workbench)
- Workbench aligns to full-document Foundry mode to restore stable preview quickly.
- Static renderer remains offline fallback only.

### Phase B (Foundry fragment delivery)
- Foundry adds fragment-capable contract with versioned schema.
- Full-document output remains supported for backward compatibility during migration window.

### Phase C (Workbench adoption)
- Workbench enables fragment adapter behind feature flag.
- Contract harness gates rollout.
- Full-document path remains rollback option until parity is proven.

### Backward compatibility
- Maintain existing full-document response behavior for current clients.
- Introduce explicit response discriminator (`output.format`) for unambiguous client routing.

## 6) Acceptance Tests and Contract Tests
### Foundry-side contract tests
1. Fragment payload never contains document wrapper tags.
2. Deterministic mapping of node IDs to fragment keys.
3. Error isolation in `strict=false` mode.
4. Full failure semantics in `strict=true` mode.
5. Scoped/deduplicatable CSS references resolve correctly.

### Cross-repo integration tests
1. Dashboard template renders multiple visible components (not single-box collapse).
2. At least three templates pass visual structure checks.
3. Fragment mode and full-document fallback both operate behind Workbench renderer interface.
4. Bridge and MCP transports return equivalent semantics for the same request.

### Go/No-Go tie-in
- Workbench sprint-12 acceptance file: `docs/verification/s12-go-no-go.md`.
- If acceptance fails, remaining implementation missions are blocked and project pause is recorded in CMOS.

## 7) Delivery Milestones and Ownership Split
### Foundry team ownership
1. Define and implement fragment contract semantics.
2. Update MCP schemas and generated types.
3. Add bridge parity behavior and policy compatibility.
4. Deliver contract tests and fixture corpus.
5. Publish migration/version notes.

### Workbench team ownership
1. Maintain renderer abstraction boundary.
2. Implement/validate fragment adapter against Foundry contract harness.
3. Execute feature-flag rollout and fallback controls.
4. Run user-visible acceptance checks and CMOS gating.

### Proposed milestones
1. M1: Contract RFC freeze (input/output + invariants).
2. M2: Foundry implementation + tests complete.
3. M3: Workbench fragment adapter validation behind flag.
4. M4: Controlled rollout with rollback path.

## 8) Risks and Fallback Behavior
### Key risks
1. Contract ambiguity between full-document and fragment responses.
2. Partial-render edge cases causing inconsistent UI state.
3. CSS collisions or duplication in fragment composition.
4. False-positive verification if tests focus on markers rather than visible structure.

### Required fallback behavior
1. If fragment mode is unavailable or contract-invalid, Workbench may fall back to full-document mode.
2. If both fail acceptance criteria, stop implementation progression and record pause/reconsideration in CMOS.
3. Keep rollback controls explicit via feature flag and documented operational runbook.
