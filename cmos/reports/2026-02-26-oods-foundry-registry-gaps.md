# OODS Foundry Registry Gaps Report

**Date**: 2026-02-26
**Author**: Agent (Sprint 13 Review)
**Target**: OODS MCP / Foundry team
**Context**: Synthesis Workbench fragment adapter integration (sprint-13)

---

## Executive Summary

Synthesis Workbench has completed migration to Foundry's fragment render API (`repl.render` with `output.format="fragments"`). During integration, we identified **two registry-level issues** that require OODS-side resolution and **one error-handling semantic** that limits fragment adoption confidence.

Workbench has implemented mitigations for all three, but they are workarounds, not solutions.

---

## 1. Grid Component Missing from Registry (Action Required)

### Problem
Foundry's component registry does not include a `Grid` layout component. When Workbench sends a design schema with `component: "Grid"`, the request fails with `UNKNOWN_COMPONENT`.

### Workbench Mitigation (in place)
- **Full-document mode**: `toLayoutComponent()` in `foundry-full-document.ts` maps all layout nodes to `component: "Stack"` and passes grid intent via props (`layoutType: "grid"`, `columns`, `rows`, `gap`, `columnGap`, `rowGap`).
- **Fragment mode**: `composeNode()` in `foundry-fragment-adapter.ts` renders Grid layouts **locally** using Workbench's own `renderGrid()` from the layout-engine, bypassing Foundry entirely.

### What We Need from OODS
**Option A (Preferred)**: Add `Grid` to the Foundry component registry as a first-class component with support for `columns`, `rows`, `gap`, `columnGap`, `rowGap` props.

**Option B**: Formally document that `Stack` accepts a `layoutType: "grid"` prop and renders as CSS Grid when that prop is present. Currently this works but is undocumented — we can't tell if it's intentional or coincidental.

### Impact of No Action
Workbench continues to work (local rendering + Stack bridge), but:
- Grid layouts rendered locally in fragment mode don't benefit from Foundry's token-aware styling
- Stack bridge in full-document mode may produce visual discrepancies vs. a native Grid component
- Design intent ("this is a grid") is lost in the Foundry render pipeline

---

## 2. UNKNOWN_COMPONENT Global Failure Semantics (Action Required)

### Problem
When `repl.render` receives a schema containing an unknown component, the **entire request fails** regardless of the `strict: false` flag. There is no per-node error isolation for unknown components.

**Example**: A 10-component design with 1 unknown component returns 0 fragments + 1 error, not 9 fragments + 1 error.

### Evidence
From contract harness (sprint-13 verification):
```
| recorded-fragments-global-failure | fixture | PASS | global-failure | 0 | 1 | none |
| live-fragments-isolation-probe    | live    | PASS | global-failure | 0 | 1 | none |
```

Both probes confirm: unknown component = global failure = zero fragments returned.

### Workbench Mitigation (in place)
Pre-validation via `repl.validate` before every `repl.render` call. If validation detects `UNKNOWN_COMPONENT`, Workbench falls back to full-document mode instead of requesting fragments.

### What We Need from OODS
**Per-node error isolation**: When `strict: false`, render all known components as fragments and return `UNKNOWN_COMPONENT` errors scoped to the specific node IDs that failed. Return partial results.

**Proposed response shape**:
```json
{
  "fragments": {
    "node-1": { "nodeId": "node-1", "component": "Button", "html": "...", "cssRefs": ["..."] },
    "node-3": { "nodeId": "node-3", "component": "Card", "html": "...", "cssRefs": ["..."] }
  },
  "errors": [
    { "nodeId": "node-2", "code": "UNKNOWN_COMPONENT", "component": "FancyWidget" }
  ],
  "css": { ... }
}
```

### Impact of No Action
- Pre-validation adds latency to every render cycle (validate + render = 2 round-trips)
- Workbench cannot gracefully degrade individual components in fragment mode
- Any new component added to a design that isn't in Foundry's registry kills the entire preview

---

## 3. TextInput — Non-Issue (Clarification)

Earlier reports mentioned `TextInput` as a registry gap. After investigation:

- Workbench's S44 component set uses **`Input`** (not `TextInput`)
- `Input` is in the Foundry registry and works correctly
- No action needed

---

## Workbench S44 Component Set (Reference)

These are the components Workbench currently sends to Foundry. All should be in the registry:

| Component | Registry Status |
|-----------|----------------|
| Button | In registry |
| Card | In registry |
| Stack | In registry |
| Text | In registry |
| Input | In registry |
| Select | In registry |
| Badge | In registry |
| Banner | In registry |
| Table | In registry |
| Tabs | In registry |
| **Grid** | **NOT in registry** |

---

## Priority Summary

| Issue | Severity | OODS Action |
|-------|----------|-------------|
| UNKNOWN_COMPONENT global failure | **High** | Add per-node error isolation for `strict: false` |
| Grid component missing | **Medium** | Add Grid to registry OR document Stack layoutType prop |
| TextInput | None | Resolved (Workbench uses Input) |
