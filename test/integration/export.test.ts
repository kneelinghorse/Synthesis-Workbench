/**
 * Export Integration Tests
 *
 * Verifies that the export workflow produces correct artifacts
 * in all three formats (HTML, JSON, YAML) using real stores
 * with realistic document/token state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stores
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useTokenStateStore, resetTokenState } from "@/lib/stores/token-state";
import { useDataContextStore } from "@/lib/stores/data-context";
import { usePreviewStateStore, resetPreviewState } from "@/lib/stores/preview-state";

// Tools
import { executeExportDesign } from "@/lib/runtime/tools/export-tools";
import { executeSetDocument } from "@/lib/runtime/tools/document-tools";

// Fixtures
import { DASHBOARD_DOCUMENT, SINGLE_BUTTON_DOCUMENT } from "../fixtures";

// Mock persistence for YAML
vi.mock("@/lib/persistence/design-store", () => ({
  toYAML: vi.fn((doc: unknown) => {
    const d = doc as { metadata?: { title?: string } };
    return `metadata:\n  title: "${d.metadata?.title ?? "untitled"}"\n`;
  }),
}));

describe("Export Integration", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    resetTokenState();
    useDataContextStore.getState().reset();
    resetPreviewState();
  });

  describe("HTML export", () => {
    it("produces a standalone HTML file with CSS variables from token state", () => {
      // Set up state
      executeSetDocument({ requestId: "html-1", document: DASHBOARD_DOCUMENT });
      useTokenStateStore.getState().setTokens({
        ...useTokenStateStore.getState().tokens,
        colors: {
          ...useTokenStateStore.getState().tokens.colors,
          primary: "#2563eb",
          secondary: "#64748b",
        },
      });
      usePreviewStateStore.getState().setHtml(
        '<div data-component="Navbar">Navbar rendered</div>'
      );

      const result = executeExportDesign({
        requestId: "html-export",
        format: "html",
        slug: "dashboard",
      });

      expect(result.exported).toBe(true);
      expect(result.format).toBe("html");
      expect(result.slug).toBe("dashboard");
      expect(result.content).toContain("<!DOCTYPE html>");
      expect(result.content).toContain("<title>Dashboard</title>");
      expect(result.content).toContain("--colors-primary: #2563eb");
      expect(result.content).toContain("--colors-secondary: #64748b");
      expect(result.content).toContain("Navbar rendered");
      expect(result.content).toContain(":root {");
    });

    it("escapes HTML entities in the document title", () => {
      executeSetDocument({
        requestId: "html-escape",
        document: {
          ...SINGLE_BUTTON_DOCUMENT,
          metadata: { title: 'Test <b>"title"</b>' },
        },
      });
      usePreviewStateStore.getState().setHtml("<div>test</div>");

      const result = executeExportDesign({
        requestId: "html-escape-export",
        format: "html",
      });

      expect(result.exported).toBe(true);
      expect(result.content).not.toContain("<b>");
      expect(result.content).toContain("&lt;b&gt;");
    });

    it("includes all token categories as CSS variables", () => {
      executeSetDocument({
        requestId: "html-tokens",
        document: SINGLE_BUTTON_DOCUMENT,
      });
      usePreviewStateStore.getState().setHtml("<div>test</div>");

      const result = executeExportDesign({
        requestId: "html-tokens-export",
        format: "html",
      });

      expect(result.exported).toBe(true);
      // Verify all major token categories are present
      expect(result.content).toContain("--colors-");
      expect(result.content).toContain("--typography-");
      expect(result.content).toContain("--spacing-");
      expect(result.content).toContain("--radius-");
      expect(result.content).toContain("--shadow-");
    });
  });

  describe("JSON export", () => {
    it("includes DesignDocument, TokenState, and DataContext", () => {
      executeSetDocument({
        requestId: "json-1",
        document: DASHBOARD_DOCUMENT,
        data: { user: { name: "Alice" }, count: 42 },
      });

      const result = executeExportDesign({
        requestId: "json-export",
        format: "json",
        slug: "dashboard-json",
      });

      expect(result.exported).toBe(true);
      expect(result.format).toBe("json");
      expect(result.slug).toBe("dashboard-json");

      const parsed = JSON.parse(result.content);
      expect(parsed.document.metadata.title).toBe("Dashboard");
      expect(parsed.document.root.nodeType).toBe("layout");
      expect(parsed.tokenState).toBeDefined();
      expect(parsed.tokenState.colors).toBeDefined();
      expect(parsed.dataContext.user).toEqual({ name: "Alice" });
      expect(parsed.dataContext.count).toBe(42);
      expect(parsed.exportedAt).toBeDefined();
    });

    it("produces pretty-printed JSON", () => {
      executeSetDocument({
        requestId: "json-pretty",
        document: SINGLE_BUTTON_DOCUMENT,
      });

      const result = executeExportDesign({
        requestId: "json-pretty-export",
        format: "json",
      });

      expect(result.content.split("\n").length).toBeGreaterThan(10);
    });

    it("includes empty data context when none is set", () => {
      executeSetDocument({
        requestId: "json-no-data",
        document: SINGLE_BUTTON_DOCUMENT,
      });

      const result = executeExportDesign({
        requestId: "json-no-data-export",
        format: "json",
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.dataContext).toEqual({});
    });
  });

  describe("YAML export", () => {
    it("delegates to the persistence YAML serializer", () => {
      executeSetDocument({
        requestId: "yaml-1",
        document: DASHBOARD_DOCUMENT,
      });

      const result = executeExportDesign({
        requestId: "yaml-export",
        format: "yaml",
        slug: "dashboard-yaml",
      });

      expect(result.exported).toBe(true);
      expect(result.format).toBe("yaml");
      expect(result.slug).toBe("dashboard-yaml");
      expect(result.content).toContain("metadata:");
      expect(result.content).toContain("Dashboard");
    });
  });

  describe("error handling", () => {
    it("fails when no document is loaded", () => {
      const result = executeExportDesign({
        requestId: "no-doc",
        format: "html",
      });

      expect(result.exported).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors![0]).toContain("No active design document");
    });

    it("fails for unsupported format", () => {
      executeSetDocument({
        requestId: "bad-format-doc",
        document: SINGLE_BUTTON_DOCUMENT,
      });

      const result = executeExportDesign({
        requestId: "bad-format",
        format: "pdf" as never,
      });

      expect(result.exported).toBe(false);
      expect(result.errors![0]).toContain("Unsupported export format");
    });

    it("defaults slug to untitled when not provided", () => {
      executeSetDocument({
        requestId: "no-slug-doc",
        document: SINGLE_BUTTON_DOCUMENT,
      });
      usePreviewStateStore.getState().setHtml("<div>test</div>");

      const result = executeExportDesign({
        requestId: "no-slug",
        format: "html",
      });

      expect(result.exported).toBe(true);
      expect(result.slug).toBe("untitled");
    });
  });
});
