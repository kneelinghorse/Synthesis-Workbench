import { describe, expect, it } from "vitest";

import { formatMcpServiceError } from "./user-facing-errors";

const makeMcpError = (
  message: string,
  code: string,
  data?: unknown
): Error & { code: string; data?: unknown } => {
  const error = new Error(message) as Error & { code: string; data?: unknown };
  error.code = code;
  error.data = data;
  return error;
};

describe("formatMcpServiceError", () => {
  it("formats Stage1 connection failures with actionable guidance", () => {
    const error = makeMcpError(
      "Stage1 MCP request failed to connect.",
      "CONNECTION_FAILED"
    );

    const message = formatMcpServiceError("stage1", error, {
      operation: "loading available Stage1 runs",
    });

    expect(message).toContain("Stage1 MCP is unreachable");
    expect(message).toContain("Stage1 MCP bridge is running");
    expect(message).toContain("NEXT_PUBLIC_STAGE1_MCP_URL");
  });

  it("formats Foundry network failures with HTTP status and service hints", () => {
    const error = makeMcpError(
      "Foundry MCP request failed (500) at http://127.0.0.1:4488/run",
      "NETWORK_ERROR",
      { status: 500 }
    );

    const message = formatMcpServiceError("foundry", error, {
      operation: "rendering the component preview",
    });

    expect(message).toContain("Foundry MCP returned HTTP 500");
    expect(message).toContain("Foundry MCP bridge is running");
    expect(message).toContain("Check Foundry MCP bridge logs");
    expect(message).not.toContain("http://127.0.0.1:4488/run");
  });

  it("formats tool errors without leaking raw endpoint details", () => {
    const error = makeMcpError(
      "Foundry MCP request failed (500) at http://127.0.0.1:4488/run: Internal server error",
      "TOOL_ERROR"
    );

    const message = formatMcpServiceError("foundry", error);

    expect(message).toContain("Foundry MCP returned a tool error");
    expect(message).toContain("Internal server error");
    expect(message).not.toContain("http://127.0.0.1:4488/run");
  });

  it("falls back to generic service-specific guidance for unknown errors", () => {
    const error = new Error("Unhandled failure");
    const message = formatMcpServiceError("foundry", error, {
      operation: "validating the schema",
    });

    expect(message).toContain("Foundry MCP request failed");
    expect(message).toContain("Foundry MCP bridge is running");
    expect(message).toContain("validating the schema");
  });
});
