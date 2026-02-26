import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";
import { useDocumentStateStore } from "@/lib/stores/document-state";
import type { DesignDocument } from "@/types/document-model";
import { renderComponent } from "./oods-tools";

vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(),
}));

describe("oods-tools renderComponent", () => {
  beforeEach(() => {
    useDocumentStateStore.getState().reset();
    vi.clearAllMocks();
  });

  it("sets document-state from a direct component schema", async () => {
    const result = await renderComponent({
      requestId: "test-req",
      schema: { component: "Button", props: { label: "Primary CTA" } },
    });

    expect(result.rendered).toBe(true);
    expect(result.documentSet).toBe(true);
    expect(result.componentCount).toBe(1);
    expect(result.componentRef).toBe("oods:Button");
    expect(result.validationSkipped).toBe(true);

    const document = useDocumentStateStore.getState().document;
    expect(document?.root).toMatchObject({
      nodeType: "component",
      ref: "oods:Button",
      props: { label: "Primary CTA" },
    });
  });

  it("uses the first screen from REPL schema payloads", async () => {
    const result = await renderComponent({
      requestId: "test-repl",
      schema: {
        mode: "full",
        schema: {
          version: "2025.11",
          screens: [
            { id: "screen-a", component: "ArchiveSummary", props: { count: 3 } },
          ],
        },
      },
    });

    expect(result.rendered).toBe(true);
    expect(result.componentRef).toBe("oods:ArchiveSummary");
    const document = useDocumentStateStore.getState().document;
    expect(document?.root).toMatchObject({
      nodeType: "component",
      id: "screen-a",
      ref: "oods:ArchiveSummary",
      props: { count: 3 },
    });
  });

  it("accepts full DesignDocument payloads without re-shaping", async () => {
    const doc: DesignDocument = {
      metadata: { title: "Direct document" },
      root: {
        nodeType: "layout",
        layout: { type: "stack", gap: 12 },
        children: [
          {
            nodeType: "component",
            id: "button-1",
            ref: "oods:Button",
            props: { label: "Ship" },
          },
        ],
      },
    };

    const result = await renderComponent({
      requestId: "doc-req",
      schema: doc,
    });

    expect(result.rendered).toBe(true);
    expect(result.nodeCount).toBe(2);
    expect(result.componentCount).toBe(1);
    expect(useDocumentStateStore.getState().document).toEqual(doc);
  });

  it("returns an actionable error when schema is missing", async () => {
    const result = await renderComponent({
      requestId: "missing-schema",
    });

    expect(result.rendered).toBe(false);
    expect(result.errors?.[0]).toContain("No component schema provided");
  });

  it("validates before document update when validate:true", async () => {
    const mockValidate = vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      warnings: ["Deprecated prop"],
      raw: {},
    });
    (getFoundryMcpClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      validate: mockValidate,
    });

    const result = await renderComponent({
      requestId: "validate-pass",
      schema: { component: "Button", props: { label: "Validate me" } },
      validate: true,
    });

    expect(mockValidate).toHaveBeenCalledWith({
      component: "Button",
      props: { label: "Validate me" },
    });
    expect(result.rendered).toBe(true);
    expect(result.validationSkipped).toBe(false);
    expect(result.warnings).toEqual(["Deprecated prop"]);
  });

  it("returns validation errors and skips document update when invalid", async () => {
    const mockValidate = vi.fn().mockResolvedValue({
      valid: false,
      errors: ["Missing required field: component"],
      warnings: ["Deprecated prop"],
      raw: {},
    });
    (getFoundryMcpClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      validate: mockValidate,
    });

    const result = await renderComponent({
      requestId: "validate-fail",
      schema: { props: {} },
      validate: true,
    });

    expect(result.rendered).toBe(false);
    expect(result.errors).toEqual(["Missing required field: component"]);
    expect(result.warnings).toEqual(["Deprecated prop"]);
    expect(useDocumentStateStore.getState().document).toBeNull();
  });

  it("returns user-friendly guidance when Foundry validation fails", async () => {
    const validationError = Object.assign(new Error("request timed out"), {
      code: "TIMEOUT",
    });
    (getFoundryMcpClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      validate: vi.fn().mockRejectedValue(validationError),
    });

    const result = await renderComponent({
      requestId: "validate-error",
      schema: { component: "Button" },
      validate: true,
    });

    expect(result.rendered).toBe(false);
    expect(result.errors?.[0]).toContain("Foundry MCP is unreachable");
  });
});
