/**
 * Pipeline Integration Tests
 *
 * End-to-end tests validating the full workflow:
 *   bundle load → token seed → document set → validate → render → preview
 *
 * All MCP boundaries (Foundry) are mocked. Zustand stores are real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stores
import { useStage1BundleStore, resetStage1BundleStore } from "@/lib/stores/stage1-bundle";
import { useTokenStateStore, resetTokenState } from "@/lib/stores/token-state";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { usePreviewStateStore, resetPreviewState } from "@/lib/stores/preview-state";
import { useDataContextStore } from "@/lib/stores/data-context";

// Tools
import { executeSetDocument } from "@/lib/runtime/tools/document-tools";
import { renderComponent } from "@/lib/runtime/tools/oods-tools";
import { validateSchema } from "@/lib/runtime/tools/validate-tools";

// Engine
import { renderDocument } from "@/lib/engine/composition-renderer";

// Fixtures
import {
  DASHBOARD_BUNDLE,
  DASHBOARD_DOCUMENT,
  createSuccessClient,
  createStrictValidateClient,
} from "../fixtures";

// Mock the Foundry MCP client factory
vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(),
}));
// Mock persistence for YAML export
vi.mock("@/lib/persistence/design-store", () => ({
  toYAML: vi.fn((doc: unknown) => `mock-yaml: true\n`),
}));

import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";

describe("Pipeline Integration", () => {
  beforeEach(() => {
    resetStage1BundleStore();
    resetTokenState();
    useDocumentStateStore.getState().reset();
    resetPreviewState();
    useDataContextStore.getState().reset();
  });

  it("runs the full pipeline: bundle → tokens → document → render → preview", async () => {
    const client = createSuccessClient();
    (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    // 1. INGEST: Load Stage1 bundle
    const bundleResult = useStage1BundleStore.getState().loadBundle(DASHBOARD_BUNDLE);
    expect(bundleResult.ok).toBe(true);
    expect(bundleResult.componentCount).toBeGreaterThan(0);
    expect(bundleResult.tokenSuggestionCount).toBeGreaterThan(0);

    // 2. INGEST: Seed token state from bundle
    const seedResult = useStage1BundleStore.getState().seedTokenState();
    expect(seedResult.appliedCount).toBeGreaterThan(0);

    // Verify tokens were updated from bundle suggestions
    const tokens = useTokenStateStore.getState().tokens;
    expect(tokens.colors.primary).toBe("#2563eb");
    expect(tokens.typography.fontFamily.sans).toBe("Inter, system-ui, sans-serif");
    expect(tokens.spacing.md).toBe("1rem");

    // 3. EXPLORE: Set design document
    const docResult = await executeSetDocument({
      requestId: "pipeline-doc",
      document: DASHBOARD_DOCUMENT,
      slug: "dashboard-test",
    });
    expect(docResult.saved).toBe(true);
    expect(docResult.nodeCount).toBeGreaterThan(0);
    expect(docResult.componentCount).toBe(5); // nav + 3 metrics + table

    // Verify document is in store
    expect(useDocumentStateStore.getState().document).toBeTruthy();

    // 4. EXPLORE: Render the composition
    const compositionResult = await renderDocument(
      DASHBOARD_DOCUMENT,
      client,
    );
    expect(compositionResult.errors).toHaveLength(0);
    expect(compositionResult.components).toHaveLength(5);
    expect(compositionResult.html).toContain("data-layout=\"stack\"");
    expect(compositionResult.html).toContain("data-layout=\"grid\"");

    // 5. Update preview state
    usePreviewStateStore.getState().setHtml(compositionResult.html);
    expect(usePreviewStateStore.getState().html).toContain("Navbar");
    expect(usePreviewStateStore.getState().html).toContain("MetricCard");
    expect(usePreviewStateStore.getState().lastUpdatedAt).toBeTruthy();
  });

  it("validates before rendering and blocks on invalid schema", async () => {
    const client = createStrictValidateClient();
    (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    // Validate with missing component field → should fail
    const invalidResult = await renderComponent({
      requestId: "validate-fail",
      schema: { props: { label: "Click" } }, // Missing "component"
      validate: true,
    });

    expect(invalidResult.rendered).toBe(false);
    expect(invalidResult.errors).toBeDefined();
    expect(invalidResult.errors!.length).toBeGreaterThan(0);
    expect(invalidResult.errors![0]).toContain("component");

    // Validate with valid schema → should succeed
    const validResult = await renderComponent({
      requestId: "validate-pass",
      schema: { component: "Button", props: { label: "Click" } },
      validate: true,
    });

    expect(validResult.rendered).toBe(true);
    expect(validResult.documentSet).toBe(true);
    expect(useDocumentStateStore.getState().document?.root).toMatchObject({
      nodeType: "component",
      ref: "oods:Button",
    });
  });

});
