/**
 * Reusable OODS (Foundry MCP) Response Fixtures
 *
 * Mock render and validate responses for integration testing.
 */

import type {
  FoundryMcpClient,
  FoundryRenderOutput,
  FoundryValidateOutput,
} from "@/lib/mcp/foundry-client";
import { vi } from "vitest";

/**
 * Creates a mock FoundryMcpClient that renders component HTML
 * based on the component name in the schema.
 */
export function createSuccessClient(): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string; props?: Record<string, unknown> };
      const name = s.component ?? "Unknown";
      const label = (s.props?.label as string) ?? "";
      return {
        html: `<div data-component="${name}">${name}${label ? `: ${label}` : ""}</div>`,
        warnings: [],
        raw: schema,
      } satisfies FoundryRenderOutput;
    }),
    validate: vi.fn(async () => ({
      valid: true,
      errors: [],
      warnings: [],
      raw: null,
    }) satisfies FoundryValidateOutput),
    buildTokens: vi.fn(async () => ({ raw: null })),
    fetchStructuredData: vi.fn(async () => ({
      dataset: "components" as const,
      version: null,
      generatedAt: null,
      etag: "mock",
      matched: false,
      payloadIncluded: false,
      path: "",
      manifestPath: null,
      sizeBytes: 0,
      schemaValidated: true,
      raw: null,
    })),
  };
}

/**
 * Creates a mock FoundryMcpClient where validate rejects schemas
 * missing a "component" field.
 */
export function createStrictValidateClient(): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      return {
        html: `<div data-component="${s.component}">${s.component} rendered</div>`,
        warnings: [],
        raw: schema,
      } satisfies FoundryRenderOutput;
    }),
    validate: vi.fn(async (schema: unknown) => {
      const s = schema as Record<string, unknown> | undefined;
      if (!s || !s.component) {
        return {
          valid: false,
          errors: ["Missing required field: component"],
          warnings: [],
          raw: schema,
        } satisfies FoundryValidateOutput;
      }
      return {
        valid: true,
        errors: [],
        warnings: [],
        raw: schema,
      } satisfies FoundryValidateOutput;
    }),
    buildTokens: vi.fn(async () => ({ raw: null })),
    fetchStructuredData: vi.fn(async () => ({
      dataset: "components" as const,
      version: null,
      generatedAt: null,
      etag: "mock",
      matched: false,
      payloadIncluded: false,
      path: "",
      manifestPath: null,
      sizeBytes: 0,
      schemaValidated: true,
      raw: null,
    })),
  };
}

/**
 * Creates a mock FoundryMcpClient where render fails
 * for specific component names.
 */
export function createPartialFailureClient(
  failComponents: string[]
): FoundryMcpClient {
  return {
    render: vi.fn(async (schema: unknown) => {
      const s = schema as { component?: string };
      if (s.component && failComponents.includes(s.component)) {
        throw new Error(`Render failed for ${s.component}: service unavailable`);
      }
      return {
        html: `<div data-component="${s.component}">${s.component} rendered</div>`,
        warnings: [],
        raw: schema,
      } satisfies FoundryRenderOutput;
    }),
    validate: vi.fn(async () => ({
      valid: true,
      errors: [],
      warnings: [],
      raw: null,
    }) satisfies FoundryValidateOutput),
    buildTokens: vi.fn(async () => ({ raw: null })),
    fetchStructuredData: vi.fn(async () => ({
      dataset: "components" as const,
      version: null,
      generatedAt: null,
      etag: "mock",
      matched: false,
      payloadIncluded: false,
      path: "",
      manifestPath: null,
      sizeBytes: 0,
      schemaValidated: true,
      raw: null,
    })),
  };
}
