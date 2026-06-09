/**
 * Composition Integration Tests
 *
 * Tests the full flow: document-state → composition renderer → preview-state.
 * Validates that the composition system works end-to-end with mock OODS.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DesignDocument } from "../src/types/document-model";
import type {
  FoundryMcpClient,
  FoundryRenderOutput,
} from "../src/lib/mcp/foundry-client";
import { renderDocument } from "../src/lib/engine/composition-renderer";
import { useDocumentStateStore } from "../src/lib/stores/document-state";
import { usePreviewStateStore } from "../src/lib/stores/preview-state";

// ============================================================================
// Mock Client
// ============================================================================

function createMockClient(): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      const name = s.component ?? "Unknown";
      return {
        html: `<div class="${name.toLowerCase()}">${name} rendered</div>`,
        warnings: [],
        raw: schema,
      } satisfies FoundryRenderOutput;
    }),
    validate: vi.fn(async () => ({
      errors: [],
      warnings: [],
      valid: true,
      raw: null,
    })),
    buildTokens: vi.fn(async () => ({ raw: null })),
    fetchStructuredData: vi.fn(),
  };
}

// ============================================================================
// Fixtures
// ============================================================================

const MULTI_COMPONENT_DOC: DesignDocument = {
  metadata: { title: "Dashboard" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 24 },
    children: [
      {
        nodeType: "component",
        id: "nav",
        ref: "oods:Navbar",
        props: { brand: "MyApp" },
      },
      {
        nodeType: "layout",
        layout: { type: "grid", columns: 3, gap: 16 },
        children: [
          {
            nodeType: "component",
            id: "metric-1",
            ref: "oods:MetricCard",
            props: { label: "Users", value: "1.2k" },
          },
          {
            nodeType: "component",
            id: "metric-2",
            ref: "oods:MetricCard",
            props: { label: "Revenue", value: "$42k" },
          },
          {
            nodeType: "component",
            id: "metric-3",
            ref: "oods:MetricCard",
            props: { label: "Growth", value: "+15%" },
          },
        ],
      },
      {
        nodeType: "component",
        id: "footer",
        ref: "oods:Footer",
        props: {},
      },
    ],
  },
};

// ============================================================================
// Tests
// ============================================================================

describe("Composition Integration", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    usePreviewStateStore.getState().reset();
  });

  it("should render a multi-component document and produce composed HTML", async () => {
    const client = createMockClient();
    const result = await renderDocument(MULTI_COMPONENT_DOC, client);

    // Layout structure
    expect(result.html).toContain('data-layout="stack"');
    expect(result.html).toContain('data-layout="grid"');

    // All 5 components rendered
    expect(result.components).toHaveLength(5);
    expect(result.errors).toHaveLength(0);

    // Component HTML present in output
    expect(result.html).toContain("Navbar rendered");
    expect(result.html).toContain("MetricCard rendered");
    expect(result.html).toContain("Footer rendered");

    // Grid has 3 columns
    expect(result.html).toContain("repeat(3, 1fr)");
  });

  it("should update preview-state with composed HTML", async () => {
    const client = createMockClient();
    const result = await renderDocument(MULTI_COMPONENT_DOC, client);

    // Simulate what useCompositionPreview does
    usePreviewStateStore.getState().setHtml(result.html);

    const previewHtml = usePreviewStateStore.getState().html;
    expect(previewHtml).toBe(result.html);
    expect(previewHtml).toContain("Navbar rendered");
    expect(usePreviewStateStore.getState().lastUpdatedAt).toBeTruthy();
  });

  it("should track document state through the full lifecycle", async () => {
    const store = useDocumentStateStore.getState();

    // 1. Set document
    store.setDocument(MULTI_COMPONENT_DOC);
    expect(useDocumentStateStore.getState().revision).toBe(1);

    // 2. Start rendering
    store.setCompositionState("rendering");
    expect(useDocumentStateStore.getState().compositionStatus).toBe(
      "rendering",
    );

    // 3. Render completes
    const client = createMockClient();
    const result = await renderDocument(MULTI_COMPONENT_DOC, client);
    usePreviewStateStore.getState().setHtml(result.html);
    store.setCompositionState("success");

    expect(useDocumentStateStore.getState().compositionStatus).toBe("success");
    expect(usePreviewStateStore.getState().html).toContain("Navbar rendered");
  });

  it("should handle partial render failures in document state", async () => {
    const client = createMockClient();
    // Override render to fail for Footer
    client.render = vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      if (s.component === "Footer") {
        throw new Error("Footer service unavailable");
      }
      return {
        html: `<div>${s.component} rendered</div>`,
        warnings: [],
        raw: schema,
      };
    });

    const store = useDocumentStateStore.getState();
    store.setDocument(MULTI_COMPONENT_DOC);
    store.setCompositionState("rendering");

    const result = await renderDocument(MULTI_COMPONENT_DOC, client);
    usePreviewStateStore.getState().setHtml(result.html);

    if (result.errors.length > 0) {
      store.setCompositionState("error", result.errors);
    } else {
      store.setCompositionState("success");
    }

    // Should still produce HTML (graceful degradation)
    expect(usePreviewStateStore.getState().html).toContain("Navbar rendered");
    expect(usePreviewStateStore.getState().html).toContain(
      "MetricCard rendered",
    );

    // Should record the error
    expect(useDocumentStateStore.getState().compositionStatus).toBe("error");
    expect(useDocumentStateStore.getState().compositionErrors).toHaveLength(1);
    expect(
      useDocumentStateStore.getState().compositionErrors[0].componentId,
    ).toBe("footer");
  });

  it("should clear errors when document changes", async () => {
    const store = useDocumentStateStore.getState();

    // Simulate error state
    store.setDocument(MULTI_COMPONENT_DOC);
    store.setCompositionState("error", [
      {
        componentId: "footer",
        componentRef: "oods:Footer",
        message: "Failed",
      },
    ]);

    expect(useDocumentStateStore.getState().compositionErrors).toHaveLength(1);

    // Change document — errors should clear
    store.setDocument({
      metadata: { title: "New" },
      root: {
        nodeType: "component",
        id: "solo",
        ref: "oods:Button",
        props: {},
      },
    });

    expect(useDocumentStateStore.getState().compositionErrors).toEqual([]);
    expect(useDocumentStateStore.getState().compositionStatus).toBe("idle");
  });
});
