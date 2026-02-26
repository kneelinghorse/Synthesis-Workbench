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
import { executeExportDesign } from "@/lib/runtime/tools/export-tools";

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

  it("chains bundle load → token seed → document → export in sequence", async () => {
    const client = createSuccessClient();
    (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue(client);

    // 1. Load bundle and seed tokens
    useStage1BundleStore.getState().loadBundle(DASHBOARD_BUNDLE);
    useStage1BundleStore.getState().seedTokenState();

    // 2. Set document
    await executeSetDocument({
      requestId: "chain-doc",
      document: DASHBOARD_DOCUMENT,
    });

    // 3. Render composition and set preview
    const composed = await renderDocument(DASHBOARD_DOCUMENT, client);
    usePreviewStateStore.getState().setHtml(composed.html);

    // 4. Export HTML (reads from stores)
    const htmlExport = executeExportDesign({
      requestId: "chain-export-html",
      format: "html",
      slug: "dashboard",
    });
    expect(htmlExport.exported).toBe(true);
    expect(htmlExport.format).toBe("html");
    expect(htmlExport.content).toContain("<!DOCTYPE html>");
    expect(htmlExport.content).toContain("--colors-primary: #2563eb");
    expect(htmlExport.content).toContain("Navbar");

    // 5. Export JSON
    const jsonExport = executeExportDesign({
      requestId: "chain-export-json",
      format: "json",
      slug: "dashboard",
    });
    expect(jsonExport.exported).toBe(true);
    const parsed = JSON.parse(jsonExport.content);
    expect(parsed.document.metadata.title).toBe("Dashboard");
    expect(parsed.tokenState.colors.primary).toBe("#2563eb");
    expect(parsed.exportedAt).toBeDefined();

    // 6. Export YAML
    const yamlExport = executeExportDesign({
      requestId: "chain-export-yaml",
      format: "yaml",
      slug: "dashboard",
    });
    expect(yamlExport.exported).toBe(true);
    expect(yamlExport.content).toBeTruthy();
  });

  it("sets data context and verifies it's included in JSON export", async () => {
    // Set document with inline data
    await executeSetDocument({
      requestId: "data-doc",
      document: DASHBOARD_DOCUMENT,
      data: { user: { name: "Alice", role: "Admin" } },
    });

    // Verify data context store was updated
    const ctx = useDataContextStore.getState().context;
    expect(ctx.user).toEqual({ name: "Alice", role: "Admin" });

    // Export JSON and verify data context is included
    const jsonExport = executeExportDesign({
      requestId: "data-export",
      format: "json",
    });
    expect(jsonExport.exported).toBe(true);
    const parsed = JSON.parse(jsonExport.content);
    expect(parsed.dataContext.user).toEqual({ name: "Alice", role: "Admin" });
  });
});
