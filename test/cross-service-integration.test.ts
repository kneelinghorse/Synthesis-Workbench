/**
 * Cross-Service Integration Smoke Test
 *
 * Verifies the full end-to-end flow:
 *   Stage1 bundle → agent context → agent composes design → Foundry renders → preview displays
 *
 * Tests the three service integration points:
 *   1. Stage1 bridge: bundle ingestion → store → system prompt enrichment
 *   2. Agent tools: all 9 tools defined and registered, tool → store → preview pipeline
 *   3. Foundry bridge: document composition → render → styled HTML in preview
 *
 * Sprint 15 — s15-m04
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { DesignDocument } from "../src/types/document-model";
import type {
  FoundryMcpClient,
  FoundryRenderOutput,
} from "../src/lib/mcp/foundry-client";
import { useDocumentStateStore } from "../src/lib/stores/document-state";
import { usePreviewStateStore } from "../src/lib/stores/preview-state";
import { useStage1BundleStore } from "../src/lib/stores/stage1-bundle";
import { useDataContextStore } from "../src/lib/stores/data-context";
import { renderDocument } from "../src/lib/engine/composition-renderer";
import { getAnthropicToolDefinitions } from "../src/lib/runtime/tools/tool-definitions";
import { renderComponent } from "../src/lib/runtime/tools/oods-tools";
import {
  executeSetDocument,
  executePatchNode,
} from "../src/lib/runtime/tools/document-tools";
import {
  buildLoadBundleToolResult,
} from "../src/lib/runtime/tools/stage1-tools";
import type { Stage1BundlePayload } from "../src/types/stage1-bundle";

// ============================================================================
// Mock Foundry Client
// ============================================================================

function createMockFoundryClient(): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      const name = s.component ?? "Unknown";
      return {
        html: `<div class="oods-${name.toLowerCase()}">${name} rendered</div>`,
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
  };
}

// ============================================================================
// Fixtures
// ============================================================================

const MOCK_STAGE1_BUNDLE: Stage1BundlePayload = {
  manifest: {
    hostname: "test-app.example.com",
    timestamp: "2026-02-26T12:00:00Z",
    runId: "test-run-001",
  },
  components: [
    { name: "Header", count: 1 },
    { name: "MetricCard", count: 3 },
    { name: "DataTable", count: 2 },
    { name: "Footer", count: 1 },
  ],
  styleFingerprint: {
    kind: "style_fingerprint",
    colors: {
      text: [
        { value: "#1a1a1a", token: true },
        { value: "#666666", token: false },
      ],
      background: [
        { value: "#ffffff", token: true },
        { value: "#f5f5f5", token: false },
      ],
    },
    type_scale: {
      font_families: ["Inter", "JetBrains Mono"],
      font_sizes: [
        { px: 12, token: false },
        { px: 14, token: true },
        { px: 16, token: true },
        { px: 20, token: false },
        { px: 24, token: false },
      ],
    },
    spacing_scale: {
      padding: [
        { px: 4, token: false },
        { px: 8, token: true },
        { px: 16, token: true },
        { px: 24, token: false },
      ],
    },
  },
  artifacts: [],
};

const DASHBOARD_DOC: DesignDocument = {
  metadata: { title: "Dashboard from Stage1 Discovery" },
  root: {
    nodeType: "layout",
    layout: { type: "stack", gap: 24 },
    children: [
      {
        nodeType: "component",
        id: "header",
        ref: "oods:Header",
        props: { brand: "TestApp" },
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
// Reset helpers
// ============================================================================

function resetAllStores() {
  useDocumentStateStore.getState().reset();
  usePreviewStateStore.getState().reset();
  useStage1BundleStore.getState().reset();
  useDataContextStore.getState().reset();
}

// ============================================================================
// Tests — Tool Definitions
// ============================================================================

describe("Cross-Service Integration: Tool Definitions", () => {
  it("should export all 11 tool definitions for the Anthropic adapter", () => {
    const tools = getAnthropicToolDefinitions();

    expect(tools).toHaveLength(11);

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("render_component");
    expect(toolNames).toContain("validate_schema");
    expect(toolNames).toContain("set_document");
    expect(toolNames).toContain("patch_node");
    expect(toolNames).toContain("set_data_context");
    expect(toolNames).toContain("update_token_state");
    expect(toolNames).toContain("export_design");
    expect(toolNames).toContain("component_catalog");
    expect(toolNames).toContain("load_bundle");
    expect(toolNames).toContain("inspect_app");
    expect(toolNames).toContain("inspect_surface");
  });

  it("each tool definition should have valid input_schema with requestId required", () => {
    const tools = getAnthropicToolDefinitions();

    for (const tool of tools) {
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.properties).toBeDefined();
      expect(tool.input_schema.properties.requestId).toBeDefined();
      expect(tool.input_schema.required).toContain("requestId");
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("load_bundle definition should have projectSlug, bundleJson, and bundle properties", () => {
    const tools = getAnthropicToolDefinitions();
    const loadBundle = tools.find((t) => t.name === "load_bundle");

    expect(loadBundle).toBeDefined();
    expect(loadBundle!.input_schema.properties.projectSlug).toBeDefined();
    expect(loadBundle!.input_schema.properties.bundleJson).toBeDefined();
    expect(loadBundle!.input_schema.properties.bundle).toBeDefined();
    // Only requestId is required — projectSlug/bundleJson/bundle are optional
    expect(loadBundle!.input_schema.required).toEqual(["requestId"]);
  });
});

// ============================================================================
// Tests — Stage1 → Agent Context Pipeline
// ============================================================================

describe("Cross-Service Integration: Stage1 → Agent Context", () => {
  beforeEach(() => resetAllStores());

  it("should load a Stage1 bundle and populate components + token suggestions", () => {
    const store = useStage1BundleStore.getState();
    const result = store.loadBundle(MOCK_STAGE1_BUNDLE);

    expect(result.ok).toBe(true);
    expect(result.componentCount).toBe(4);
    expect(result.tokenSuggestionCount).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Store is populated
    const state = useStage1BundleStore.getState();
    expect(state.components).toHaveLength(4);
    expect(state.components.map((c) => c.name)).toContain("Header");
    expect(state.components.map((c) => c.name)).toContain("MetricCard");
    expect(state.loadedAt).toBeTruthy();

    // Token suggestions extracted from style fingerprint
    const tokens = state.tokenSuggestions;
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    expect(tokens["typography.fontFamily.sans"]).toBe("Inter");
    expect(tokens["typography.fontFamily.mono"]).toBe("JetBrains Mono");
  });

  it("should build correct tool result from load bundle outcome", () => {
    const store = useStage1BundleStore.getState();
    const outcome = store.loadBundle(MOCK_STAGE1_BUNDLE);
    const toolResult = buildLoadBundleToolResult(outcome);

    expect(toolResult.loaded).toBe(true);
    expect(toolResult.componentCount).toBe(4);
    expect(toolResult.tokenSuggestionCount).toBeGreaterThan(0);
    expect(toolResult.errors).toBeUndefined();
    expect(toolResult.resolvedAt).toBeTruthy();
  });

  it("should reject bundles without a manifest", () => {
    const store = useStage1BundleStore.getState();
    const result = store.loadBundle({ components: [] } as unknown as Stage1BundlePayload);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tests — Agent Tool → Document → Preview Pipeline
// ============================================================================

describe("Cross-Service Integration: Agent Tool → Document → Preview", () => {
  beforeEach(() => resetAllStores());

  it("set_document tool should push document into store and trigger composition state", async () => {
    const result = await executeSetDocument({
      requestId: "smoke-sd-1",
      document: DASHBOARD_DOC,
    });

    expect(result.saved).toBe(true);
    expect(result.nodeCount).toBeGreaterThan(0);
    expect(result.componentCount).toBeGreaterThan(0);

    // Document is set in the store
    const doc = useDocumentStateStore.getState().document;
    expect(doc).toBeTruthy();
    expect(doc?.metadata.title).toBe("Dashboard from Stage1 Discovery");
  });

  it("patch_node tool should update a component in the active document", async () => {
    // First set a document
    await executeSetDocument({
      requestId: "smoke-pn-setup",
      document: DASHBOARD_DOC,
    });

    // Patch a node
    const patchResult = executePatchNode({
      requestId: "smoke-pn-1",
      nodeId: "metric-1",
      props: { label: "Active Users", value: "2.4k" },
    });

    expect(patchResult.patched).toBe(true);
    expect(patchResult.nodeId).toBe("metric-1");
  });

  it("render_component tool should create a single-component document", async () => {
    const result = await renderComponent({
      requestId: "smoke-rc-1",
      schema: {
        component: "Button",
        props: { label: "Click me", variant: "primary" },
      },
    });

    expect(result.rendered).toBe(true);
    expect(result.documentSet).toBe(true);
    expect(result.componentRef).toBe("oods:Button");

    // Document should be set in store
    const doc = useDocumentStateStore.getState().document;
    expect(doc).toBeTruthy();
    expect(doc?.root.nodeType).toBe("component");
  });

  it("composition renderer should produce HTML from document + mock Foundry", async () => {
    const client = createMockFoundryClient();
    const result = await renderDocument(DASHBOARD_DOC, client);

    // HTML produced with layout structure
    expect(result.html).toContain('data-layout="stack"');
    expect(result.html).toContain('data-layout="grid"');

    // All components rendered
    expect(result.components).toHaveLength(5);
    expect(result.errors).toHaveLength(0);

    // Component content in output
    expect(result.html).toContain("Header rendered");
    expect(result.html).toContain("MetricCard rendered");
    expect(result.html).toContain("Footer rendered");

    // Push to preview state
    usePreviewStateStore.getState().setHtml(result.html);
    expect(usePreviewStateStore.getState().html).toContain("Header rendered");
  });
});

// ============================================================================
// Tests — Full End-to-End Flow
// ============================================================================

describe("Cross-Service Integration: Full E2E Flow", () => {
  beforeEach(() => resetAllStores());

  it("should execute: Stage1 bundle → agent sets document → Foundry renders → preview displays", async () => {
    // STEP 1: Stage1 bundle ingestion (simulates load_bundle tool)
    const bundleResult = useStage1BundleStore.getState().loadBundle(MOCK_STAGE1_BUNDLE);
    expect(bundleResult.ok).toBe(true);

    // Verify discovery data is in store
    const bundleState = useStage1BundleStore.getState();
    expect(bundleState.components.length).toBeGreaterThan(0);
    expect(Object.keys(bundleState.tokenSuggestions).length).toBeGreaterThan(0);

    // STEP 2: Agent creates a design document (simulates set_document tool)
    const setDocResult = await executeSetDocument({
      requestId: "e2e-1",
      document: DASHBOARD_DOC,
    });
    expect(setDocResult.saved).toBe(true);

    // Verify document is in state
    const docState = useDocumentStateStore.getState();
    expect(docState.document).toBeTruthy();
    expect(docState.revision).toBeGreaterThan(0);

    // STEP 3: Composition renderer processes document with Foundry (simulated)
    const client = createMockFoundryClient();
    const renderResult = await renderDocument(DASHBOARD_DOC, client);
    expect(renderResult.errors).toHaveLength(0);
    expect(renderResult.html.length).toBeGreaterThan(100);

    // STEP 4: HTML pushed to preview state
    usePreviewStateStore.getState().setHtml(renderResult.html);
    usePreviewStateStore.getState().setFoundryStatus("live");

    const preview = usePreviewStateStore.getState();
    expect(preview.html).toContain("Header rendered");
    expect(preview.html).toContain("MetricCard rendered");
    expect(preview.foundryStatus).toBe("live");
    expect(preview.lastUpdatedAt).toBeTruthy();
  });

  it("should support agent iteration: set_document → patch_node → re-render", async () => {
    const client = createMockFoundryClient();

    // STEP 1: Initial document
    await executeSetDocument({
      requestId: "iter-1",
      document: DASHBOARD_DOC,
    });

    const renderResult1 = await renderDocument(DASHBOARD_DOC, client);
    usePreviewStateStore.getState().setHtml(renderResult1.html);
    expect(usePreviewStateStore.getState().html).toContain("MetricCard rendered");

    // STEP 2: Patch a node
    const patchResult = executePatchNode({
      requestId: "iter-2",
      nodeId: "metric-1",
      props: { label: "Active Users", value: "2.4k" },
    });
    expect(patchResult.patched).toBe(true);

    // STEP 3: Re-render the updated document
    const updatedDoc = useDocumentStateStore.getState().document!;
    const renderResult2 = await renderDocument(updatedDoc, client);
    usePreviewStateStore.getState().setHtml(renderResult2.html);

    // Preview should still contain the rendered components
    expect(usePreviewStateStore.getState().html).toContain("MetricCard rendered");
    expect(renderResult2.errors).toHaveLength(0);

    // Document revision should have incremented
    expect(useDocumentStateStore.getState().revision).toBeGreaterThan(1);
  });

  it("should support data context enrichment in the pipeline", () => {
    // Set data context (simulates set_data_context tool)
    useDataContextStore.getState().setContext({
      users: { total: 1200, active: 800 },
      revenue: { monthly: 42000 },
    });

    const ctx = useDataContextStore.getState();
    expect(ctx.context).toBeTruthy();
    expect(ctx.revision).toBeGreaterThan(0);
    expect(ctx.context.users).toEqual({ total: 1200, active: 800 });
  });
});

// ============================================================================
// Tests — Graceful Degradation
// ============================================================================

describe("Cross-Service Integration: Graceful Degradation", () => {
  beforeEach(() => resetAllStores());

  it("should handle partial Foundry failures with composition errors", async () => {
    const client = createMockFoundryClient();
    client.render = vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      if (s.component === "Footer") {
        throw new Error("Foundry: component not found");
      }
      return {
        html: `<div>${s.component} rendered</div>`,
        warnings: [],
        raw: schema,
      };
    });

    const result = await renderDocument(DASHBOARD_DOC, client);

    // Should still have partial HTML
    expect(result.html).toContain("Header rendered");
    expect(result.html).toContain("MetricCard rendered");

    // Should record the error for Footer
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.componentId === "footer")).toBe(true);

    // Components that succeeded should be counted
    expect(result.components.length).toBeGreaterThanOrEqual(4);
  });

  it("should handle empty Stage1 bundle gracefully", () => {
    const store = useStage1BundleStore.getState();
    const result = store.loadBundle({
      manifest: {
        hostname: "empty.example.com",
        timestamp: "2026-02-26T12:00:00Z",
        runId: "empty-run",
      },
      components: [],
      artifacts: [],
    });

    expect(result.ok).toBe(true);
    expect(result.componentCount).toBe(0);
    expect(result.tokenSuggestionCount).toBe(0);
  });

  it("render_component should handle missing schema gracefully", async () => {
    const result = await renderComponent({
      requestId: "missing-schema",
    });

    expect(result.rendered).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });
});
