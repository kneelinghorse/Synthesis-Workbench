import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeExportDesign } from "./export-tools";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import { useTokenStateStore } from "@/lib/stores/token-state";
import { useDataContextStore } from "@/lib/stores/data-context";
import { usePreviewStateStore } from "@/lib/stores/preview-state";
import type { DesignDocument } from "@/types/document-model";
import { DEFAULT_TOKEN_STATE } from "@/types/token-state";
import { exportComponentSpec } from "@/lib/export/export-component-spec";
import { exportCss } from "@/lib/export/export-css";
import { exportHtml } from "@/lib/export/export-html";
import { exportJson } from "@/lib/export/export-json";
import { exportScss } from "@/lib/export/export-scss";
import { exportYaml } from "@/lib/export/export-yaml";

vi.mock("@/lib/export/export-component-spec", () => ({
  exportComponentSpec: vi.fn(() => '{"components":[{"id":"mock"}]}'),
}));
vi.mock("@/lib/export/export-css", () => ({
  exportCss: vi.fn(() => ":root {\n  --mock: true;\n}\n"),
}));
vi.mock("@/lib/export/export-html", () => ({
  exportHtml: vi.fn(() => "<html>mock</html>"),
}));
vi.mock("@/lib/export/export-json", () => ({
  exportJson: vi.fn(() => '{"mock":true}'),
}));
vi.mock("@/lib/export/export-scss", () => ({
  exportScss: vi.fn(() => "$mock: true;\n"),
}));
vi.mock("@/lib/export/export-yaml", () => ({
  exportYaml: vi.fn(() => "mock: yaml\n"),
}));

const mockDocument: DesignDocument = {
  metadata: { title: "Test" },
  root: {
    nodeType: "component",
    id: "btn-1",
    ref: "oods:Button",
    props: { label: "Test" },
  },
};

describe("executeExportDesign", () => {
  beforeEach(() => {
    useDocumentStateStore.setState({ document: mockDocument });
    useTokenStateStore.setState({
      tokens: DEFAULT_TOKEN_STATE,
      annotations: { "colors.primary": "Brand CTA color" },
    });
    useDataContextStore.setState({ context: {} });
    usePreviewStateStore.setState({ html: "<div>preview</div>" });
    vi.mocked(exportComponentSpec).mockClear();
    vi.mocked(exportCss).mockClear();
    vi.mocked(exportHtml).mockClear();
    vi.mocked(exportJson).mockClear();
    vi.mocked(exportScss).mockClear();
    vi.mocked(exportYaml).mockClear();
  });

  it("exports HTML format successfully", () => {
    const result = executeExportDesign({
      requestId: "test-1",
      format: "html",
    });

    expect(result.exported).toBe(true);
    expect(result.format).toBe("html");
    expect(result.extension).toBe(".html");
    expect(result.mimeType).toBe("text/html");
    expect(result.content).toBe("<html>mock</html>");
    expect(result.errors).toBeUndefined();
    expect(result.resolvedAt).toBeDefined();
    expect(exportHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAnnotations: { "colors.primary": "Brand CTA color" },
      })
    );
  });

  it("exports JSON format successfully", () => {
    const result = executeExportDesign({
      requestId: "test-2",
      format: "json",
    });

    expect(result.exported).toBe(true);
    expect(result.format).toBe("json");
    expect(result.content).toBe('{"mock":true}');
    expect(exportJson).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAnnotations: { "colors.primary": "Brand CTA color" },
      })
    );
  });

  it("exports YAML format successfully", () => {
    const result = executeExportDesign({
      requestId: "test-3",
      format: "yaml",
    });

    expect(result.exported).toBe(true);
    expect(result.format).toBe("yaml");
    expect(result.content).toBe("mock: yaml\n");
    expect(exportYaml).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAnnotations: { "colors.primary": "Brand CTA color" },
      })
    );
  });

  it("exports CSS format successfully", () => {
    const result = executeExportDesign({
      requestId: "test-3b",
      format: "css",
    });

    expect(result.exported).toBe(true);
    expect(result.format).toBe("css");
    expect(result.content).toContain("--mock: true");
    expect(exportCss).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAnnotations: { "colors.primary": "Brand CTA color" },
      })
    );
  });

  it("exports SCSS format successfully", () => {
    const result = executeExportDesign({
      requestId: "test-3c",
      format: "scss",
    });

    expect(result.exported).toBe(true);
    expect(result.format).toBe("scss");
    expect(result.content).toBe("$mock: true;\n");
    expect(exportScss).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenAnnotations: { "colors.primary": "Brand CTA color" },
      })
    );
  });

  it("exports component spec format successfully", () => {
    const result = executeExportDesign({
      requestId: "test-3d",
      format: "spec",
    });

    expect(result.exported).toBe(true);
    expect(result.format).toBe("spec");
    expect(result.content).toContain('"components"');
    expect(exportComponentSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        document: mockDocument,
      })
    );
  });

  it("uses provided slug or defaults to untitled", () => {
    const withSlug = executeExportDesign({
      requestId: "test-4",
      format: "html",
      slug: "my-design",
    });
    expect(withSlug.slug).toBe("my-design");

    const withoutSlug = executeExportDesign({
      requestId: "test-5",
      format: "html",
    });
    expect(withoutSlug.slug).toBe("untitled");
  });

  it("returns error when no document is loaded", () => {
    useDocumentStateStore.setState({ document: null });

    const result = executeExportDesign({
      requestId: "test-6",
      format: "html",
    });

    expect(result.exported).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain("No active design document");
  });

  it("returns error for unsupported format", () => {
    const result = executeExportDesign({
      requestId: "test-7",
      format: "pdf" as never,
    });

    expect(result.exported).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain("Unsupported export format");
  });
});
