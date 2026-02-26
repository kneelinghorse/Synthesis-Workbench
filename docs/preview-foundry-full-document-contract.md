# Preview Foundry Full-Document Contract

## Scope
This document defines the Workbench live preview contract with Foundry across sprint-12 and sprint-13 migration work.

## Runtime Path
- Hook entry: `src/hooks/useCompositionPreview.ts`
- Payload builder: `src/lib/engine/foundry-full-document.ts`
- Renderer boundary: `src/lib/engine/preview-renderer.ts`
- Foundry transport client: `src/lib/mcp/foundry-client.ts`

## Contract
For every preview render cycle, Workbench sends exactly one Foundry render request:

```json
{
  "mode": "full",
  "schema": {
    "version": "2025.11",
    "screens": [
      {
        "id": "screen-root",
        "component": "Stack",
        "children": [
          {
            "id": "heading-1",
            "component": "Text",
            "props": {
              "text": "Resolved value"
            }
          }
        ]
      }
    ]
  }
}
```

## Mapping Rules
- `DesignDocument.root` maps to one `screens[0]` tree.
- `ComponentNode.ref` (`oods:Text`) maps to Foundry `component` (`Text`).
- `LayoutNode` maps to synthetic Foundry-safe container components with deterministic IDs:
  - Root layout: `screen-root`
  - Nested layout: `layout-<path>` (example: `layout-1-0`)
- Current bridge compatibility maps both stack/grid layouts to `Stack`; grid intent is carried in props (`layoutType: "grid"`, `columns`, `gap`, etc.).
- Data bindings (`$data.x`) are resolved before request dispatch.
- Binding failures are reported as composition errors but do not remove the render payload.

## Fallback Rules
- Static renderer fallback is allowed only when Foundry is unavailable:
  - Missing base URL
  - Connection/network failure
  - Timeout
- Non-availability errors (tool/validation failures) remain render errors and do not trigger static fallback.

## Renderer Boundary (Sprint-13)
- `PreviewRenderer` interface is the only live-preview render contract consumed by `useCompositionPreview`.
- Adapters:
  - `fragments`: single render call with `output.format="fragments"`, pre-validated via `repl.validate`, then locally composed into layout HTML.
  - `full-document`: rollback-safe fallback path.
  - `composition`: compatibility alias that now routes to the `fragments` adapter (legacy per-component path deprecated).
- Feature flag / selection:
  - `NEXT_PUBLIC_PREVIEW_RENDERER_MODE` or `PREVIEW_RENDERER_MODE`
  - Supported values: `fragments`, `composition`, `full-document`
  - `composition` and `fragments` now share fragment-adapter behavior.

## Verification
- Unit tests: `src/lib/engine/foundry-full-document.test.ts`
- Renderer contract tests: `src/lib/engine/preview-renderer.test.ts`
- Hook behavior tests: `src/hooks/useCompositionPreview.test.tsx`
