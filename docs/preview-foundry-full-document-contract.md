# Preview Foundry Full-Document Contract

## Scope
This document defines the Workbench live preview contract with Foundry for sprint-12 reset work.

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

## Renderer Boundary (Sprint-12 / Sprint-13 Bridge)
- `PreviewRenderer` interface is the only live-preview render contract consumed by `useCompositionPreview`.
- Active adapter: `full-document` (single Foundry render call per cycle).
- Isolated adapter: `composition` (legacy per-component composition path behind the same interface).
- Sprint-13 fragment migration plan:
  - Add a `fragments` adapter behind `PreviewRenderer`.
  - Switch adapter selection with config/feature flag.
  - Keep `full-document` adapter as rollback path until fragment parity is proven.

## Verification
- Unit tests: `src/lib/engine/foundry-full-document.test.ts`
- Renderer contract tests: `src/lib/engine/preview-renderer.test.ts`
- Hook behavior tests: `src/hooks/useCompositionPreview.test.tsx`
