import { describe, it, expect, vi } from "vitest";
import { validateSchema } from "./validate-tools";
import { getFoundryMcpClient } from "@/lib/mcp/foundry-client";

vi.mock("@/lib/mcp/foundry-client", () => ({
  getFoundryMcpClient: vi.fn(),
}));

describe("validateSchema", () => {
  it("returns valid result for a valid schema", async () => {
    const mockValidate = vi.fn().mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
      raw: {},
    });
    (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue({
      validate: mockValidate,
    });

    const result = await validateSchema({
      requestId: "test-valid",
      schema: { component: "Button", props: { label: "Click" } },
    });

    expect(mockValidate).toHaveBeenCalledWith({
      component: "Button",
      props: { label: "Click" },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.resolvedAt).toBeDefined();
  });

  it("returns errors for an invalid schema", async () => {
    const mockValidate = vi.fn().mockResolvedValue({
      valid: false,
      errors: ["Missing required field: component"],
      warnings: ["Deprecated prop usage"],
      raw: {},
    });
    (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue({
      validate: mockValidate,
    });

    const result = await validateSchema({
      requestId: "test-invalid",
      schema: { props: { label: "Click" } },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["Missing required field: component"]);
    expect(result.warnings).toEqual(["Deprecated prop usage"]);
  });

  it("handles validation errors gracefully", async () => {
    const mcpError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "CONNECTION_FAILED",
    });
    (getFoundryMcpClient as ReturnType<typeof vi.fn>).mockReturnValue({
      validate: vi.fn().mockRejectedValue(mcpError),
    });

    const result = await validateSchema({
      requestId: "test-error",
      schema: { component: "Button" },
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Foundry MCP is unreachable");
    expect(result.errors[0]).toContain("NEXT_PUBLIC_OODS_FOUNDRY_MCP_URL");
    expect(result.warnings).toEqual([]);
  });
});
