import { describe, expect, it } from "vitest";

import {
  LOAD_BUNDLE_TOOL_NAME,
  INSPECT_APP_TOOL_NAME,
  INSPECT_SURFACE_TOOL_NAME,
  buildLoadBundleToolResult,
  buildInspectToolResult,
  type InspectAppToolResult,
  type InspectSurfaceToolResult,
} from "./stage1-tools";
import { getAnthropicToolDefinitions } from "./tool-definitions";

describe("stage1 tool name constants", () => {
  it("exports correct tool names", () => {
    expect(LOAD_BUNDLE_TOOL_NAME).toBe("load_bundle");
    expect(INSPECT_APP_TOOL_NAME).toBe("inspect_app");
    expect(INSPECT_SURFACE_TOOL_NAME).toBe("inspect_surface");
  });
});

describe("buildLoadBundleToolResult", () => {
  it("builds result from successful bundle load", () => {
    const result = buildLoadBundleToolResult({
      ok: true,
      componentCount: 5,
      tokenSuggestionCount: 12,
      components: [],
      tokenSuggestions: {},
      enrichedTokens: {},
      compositionPatterns: [],
      errors: [],
    });

    expect(result.loaded).toBe(true);
    expect(result.componentCount).toBe(5);
    expect(result.tokenSuggestionCount).toBe(12);
    expect(result.errors).toBeUndefined();
    expect(result.resolvedAt).toBeTruthy();
  });

  it("includes errors when present", () => {
    const result = buildLoadBundleToolResult({
      ok: false,
      componentCount: 0,
      tokenSuggestionCount: 0,
      components: [],
      tokenSuggestions: {},
      enrichedTokens: {},
      compositionPatterns: [],
      errors: ["Invalid bundle format"],
    });

    expect(result.loaded).toBe(false);
    expect(result.errors).toEqual(["Invalid bundle format"]);
  });
});

describe("buildInspectToolResult", () => {
  it("builds successful inspection result", () => {
    const result = buildInspectToolResult(
      {
        run: {
          runId: "abc-123",
          hostname: "example.com",
          runDir: "/tmp/out/example.com/abc-123",
          timestamp: "2026-02-27T10:00:00.000Z",
        },
        payload: { some: "data" },
        message: "Inspection complete",
      },
      "https://example.com"
    );

    expect(result.inspected).toBe(true);
    expect(result.url).toBe("https://example.com");
    expect(result.runId).toBe("abc-123");
    expect(result.runDir).toBe("/tmp/out/example.com/abc-123");
    expect(result.hostname).toBe("example.com");
    expect(result.message).toBe("Inspection complete");
    expect(result.errors).toBeUndefined();
    expect(result.resolvedAt).toBeTruthy();
  });

  it("builds failed inspection result when run is null", () => {
    const result = buildInspectToolResult(
      { run: null, payload: null, message: "Connection refused" },
      "https://unreachable.test"
    );

    expect(result.inspected).toBe(false);
    expect(result.url).toBe("https://unreachable.test");
    expect(result.runId).toBeNull();
    expect(result.runDir).toBeNull();
    expect(result.hostname).toBeNull();
    expect(result.message).toBe("Connection refused");
  });

  it("marks as not inspected when error is provided", () => {
    const result = buildInspectToolResult(
      {
        run: {
          runId: "abc-123",
          hostname: "example.com",
        },
        payload: null,
      },
      "https://example.com",
      { error: "Timed out" }
    );

    expect(result.inspected).toBe(false);
    expect(result.errors).toEqual(["Timed out"]);
  });

  it("includes discovery summary when provided", () => {
    const discovery = {
      bundleLoaded: true,
      componentCount: 5,
      tokenSuggestionCount: 12,
      discoveredComponents: ["Button", "Card", "Header"],
      tokenPaths: ["colors.primary", "typography.fontSize.base"],
      errors: [],
      hasEnrichedTokens: true,
      compositionPatternCount: 3,
    };

    const result = buildInspectToolResult(
      {
        run: { runId: "abc-123", hostname: "example.com", runDir: "/tmp/out/abc-123" },
        payload: null,
        message: "Done",
      },
      "https://example.com",
      { discovery }
    );

    expect(result.inspected).toBe(true);
    expect(result.discovery).toEqual(discovery);
    expect(result.discovery?.componentCount).toBe(5);
    expect(result.discovery?.discoveredComponents).toContain("Button");
  });

  it("result is assignable to InspectAppToolResult", () => {
    const result: InspectAppToolResult = buildInspectToolResult(
      { run: null, payload: null },
      "https://example.com"
    );
    expect(result.inspected).toBe(false);
  });

  it("result is assignable to InspectSurfaceToolResult", () => {
    const result: InspectSurfaceToolResult = buildInspectToolResult(
      { run: null, payload: null },
      "https://example.com"
    );
    expect(result.inspected).toBe(false);
  });
});

describe("tool definitions include inspect tools", () => {
  const definitions = getAnthropicToolDefinitions();

  it("includes inspect_app definition", () => {
    const def = definitions.find((d) => d.name === INSPECT_APP_TOOL_NAME);
    expect(def).toBeDefined();
    expect(def!.input_schema.required).toContain("requestId");
    expect(def!.input_schema.required).toContain("url");
    expect(def!.input_schema.properties).toHaveProperty("url");
    expect(def!.input_schema.properties).toHaveProperty("crawlDepth");
    expect(def!.input_schema.properties).toHaveProperty("include");
    expect(def!.input_schema.properties).toHaveProperty("components");
    expect(def!.input_schema.properties).toHaveProperty("seedRoutes");
  });

  it("includes inspect_surface definition", () => {
    const def = definitions.find((d) => d.name === INSPECT_SURFACE_TOOL_NAME);
    expect(def).toBeDefined();
    expect(def!.input_schema.required).toContain("requestId");
    expect(def!.input_schema.required).toContain("url");
    expect(def!.input_schema.properties).toHaveProperty("url");
    expect(def!.input_schema.properties).toHaveProperty("passes");
    expect(def!.input_schema.properties).toHaveProperty("seedRoutes");
  });

  it("has 10 total tool definitions", () => {
    expect(definitions).toHaveLength(10);
  });
});
