import { describe, expect, it, vi } from "vitest";

import {
  runInspectionPipeline,
  type InspectionPipelineResult,
} from "./inspection-pipeline";
import type {
  Stage1InspectionResult,
  Stage1McpClient,
} from "@/lib/mcp/stage1-client";
import type { Stage1BundleLoadResult } from "@/types/stage1-bundle";

/**
 * These tests exercise the pipeline logic with fully injected dependencies
 * so no real MCP calls or Zustand stores are needed.
 */

const makeInspectionResult = (
  overrides: Partial<Stage1InspectionResult> = {}
): Stage1InspectionResult => ({
  run: {
    runId: "test-run-001",
    hostname: "example.com",
    runDir: "/tmp/out/example.com/test-run-001",
    timestamp: "2026-02-27T12:00:00.000Z",
  },
  payload: { raw: "data" },
  message: "Inspection complete",
  ...overrides,
});

const makeLoadResult = (
  overrides: Partial<Stage1BundleLoadResult> = {}
): Stage1BundleLoadResult => ({
  ok: true,
  componentCount: 0,
  tokenSuggestionCount: 0,
  components: [],
  tokenSuggestions: {},
  enrichedTokens: {},
  compositionPatterns: [],
  errors: [],
  ...overrides,
});

describe("runInspectionPipeline", () => {
  it("returns inspected=false when run is null (no upstream error)", async () => {
    const result = await runInspectionPipeline({
      run: null,
      payload: null,
    });

    expect(result.inspected).toBe(false);
    expect(result.discovery).toBeNull();
    expect(result.error).toBe("Inspection did not produce a run reference.");
  });

  it("surfaces upstream error message when run is null", async () => {
    const result = await runInspectionPipeline({
      run: null,
      payload: null,
      error: {
        code: "PARSE_ERROR",
        message:
          "Expected app_profile.json to be created, but it was missing",
      },
    });

    expect(result.inspected).toBe(false);
    expect(result.discovery).toBeNull();
    expect(result.error).toBe(
      "[PARSE_ERROR] Expected app_profile.json to be created, but it was missing"
    );
    expect(result.inspectionError).toBeDefined();
    expect(result.inspectionError?.code).toBe("PARSE_ERROR");
  });

  it("uses inspection message as fallback when no structured error", async () => {
    const result = await runInspectionPipeline({
      run: null,
      payload: null,
      message: "Connection refused",
    });

    expect(result.inspected).toBe(false);
    expect(result.error).toBe("Connection refused");
  });

  it("returns error when run has no runDir", async () => {
    const result = await runInspectionPipeline({
      run: { runId: "abc", hostname: "example.com" },
      payload: null,
    });

    expect(result.inspected).toBe(true);
    expect(result.discovery).toBeNull();
    expect(result.error).toContain("no output directory");
  });

  it("chains inspection → bundle build → store load on success", async () => {
    // Mock the bundle-loader module (buildStage1BundleFromRun)
    const mockBundle = {
      manifest: { generatedAt: "2026-02-27T12:00:00.000Z" },
      artifacts: [
        { type: "component_clusters", path: "component_clusters.json", payload: {} },
        { type: "token_guess", path: "token_guess.json", payload: {} },
      ],
    };

    // We inject a loadBundle function and component/token readers
    const mockLoadBundle = vi.fn(() =>
      makeLoadResult({
        ok: true,
        componentCount: 3,
        tokenSuggestionCount: 8,
        errors: [] as string[],
      })
    );

    const mockComponents = [
      { name: "Button" },
      { name: "Card" },
      { name: "Header" },
    ];

    const mockTokenSuggestions: Record<string, string> = {
      "colors.primary": "#007bff",
      "colors.background": "#ffffff",
      "typography.fontSize.base": "16px",
    };

    // Mock the MCP client to build the bundle
    const mockClient: Stage1McpClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => mockBundle) as Stage1McpClient["getArtifact"],
      inspectApp: vi.fn(),
      inspectSurface: vi.fn(),
    };

    // The actual buildStage1BundleFromRun is called inside the pipeline,
    // which calls client.getArtifact. We need to mock at module level.
    // Instead, we'll test with the real function but mock the client.
    // For this test, let's use the options overrides for store access.
    const result = await runInspectionPipeline(makeInspectionResult(), {
      client: mockClient,
      loadBundle: mockLoadBundle,
      getComponents: () => mockComponents,
      getTokenSuggestions: () => mockTokenSuggestions,
    });

    expect(result.inspected).toBe(true);
    expect(result.discovery).not.toBeNull();
    expect(result.discovery?.bundleLoaded).toBe(true);
    expect(result.discovery?.componentCount).toBe(3);
    expect(result.discovery?.tokenSuggestionCount).toBe(8);
    expect(result.discovery?.discoveredComponents).toEqual([
      "Button",
      "Card",
      "Header",
    ]);
    expect(result.discovery?.tokenPaths).toEqual([
      "colors.primary",
      "colors.background",
      "typography.fontSize.base",
    ]);
    expect(result.discovery?.errors).toEqual([]);
    expect(mockLoadBundle).toHaveBeenCalledTimes(1);
  });

  it("reports partial success when bundle loads with errors", async () => {
    const mockLoadBundle = vi.fn(() =>
      makeLoadResult({
        ok: false,
        componentCount: 1,
        tokenSuggestionCount: 0,
        errors: ["Unknown artifact format"],
      })
    );

    const mockClient: Stage1McpClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => ({
        manifest: {},
        artifacts: [],
      })) as Stage1McpClient["getArtifact"],
      inspectApp: vi.fn(),
      inspectSurface: vi.fn(),
    };

    const result = await runInspectionPipeline(makeInspectionResult(), {
      client: mockClient,
      loadBundle: mockLoadBundle,
      getComponents: () => [{ name: "Fallback" }],
      getTokenSuggestions: () => ({}),
    });

    expect(result.inspected).toBe(true);
    expect(result.discovery).not.toBeNull();
    expect(result.discovery?.bundleLoaded).toBe(false);
    expect(result.discovery?.errors).toEqual(["Unknown artifact format"]);
  });

  it("catches and reports bundle build failures gracefully", async () => {
    const mockClient: Stage1McpClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => {
        throw new Error("MCP connection refused");
      }) as Stage1McpClient["getArtifact"],
      inspectApp: vi.fn(),
      inspectSurface: vi.fn(),
    };

    const result = await runInspectionPipeline(makeInspectionResult(), {
      client: mockClient,
    });

    expect(result.inspected).toBe(true);
    expect(result.discovery).toBeNull();
    expect(result.error).toBe("MCP connection refused");
  });

  it("handles empty discovery (no components, no tokens)", async () => {
    const mockLoadBundle = vi.fn(() =>
      makeLoadResult({
        ok: true,
        componentCount: 0,
        tokenSuggestionCount: 0,
        errors: [] as string[],
      })
    );

    const mockClient: Stage1McpClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => ({
        manifest: {},
        artifacts: [],
      })) as Stage1McpClient["getArtifact"],
      inspectApp: vi.fn(),
      inspectSurface: vi.fn(),
    };

    const result = await runInspectionPipeline(makeInspectionResult(), {
      client: mockClient,
      loadBundle: mockLoadBundle,
      getComponents: () => [],
      getTokenSuggestions: () => ({}),
    });

    expect(result.inspected).toBe(true);
    expect(result.discovery?.bundleLoaded).toBe(true);
    expect(result.discovery?.componentCount).toBe(0);
    expect(result.discovery?.tokenSuggestionCount).toBe(0);
    expect(result.discovery?.discoveredComponents).toEqual([]);
    expect(result.discovery?.tokenPaths).toEqual([]);
  });

  it("propagates inspectionError to discovery summary", async () => {
    const mockLoadBundle = vi.fn(() =>
      makeLoadResult({
        ok: true,
        componentCount: 0,
        tokenSuggestionCount: 0,
        errors: [] as string[],
      })
    );

    const mockClient: Stage1McpClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => ({
        manifest: {},
        artifacts: [],
      })) as Stage1McpClient["getArtifact"],
      inspectApp: vi.fn(),
      inspectSurface: vi.fn(),
    };

    const result = await runInspectionPipeline(
      makeInspectionResult({
        error: {
          code: "CRAWL_ERROR",
          message: "Failed to crawl page",
          detail: "Blocked by robots.txt",
        },
      }),
      {
        client: mockClient,
        loadBundle: mockLoadBundle,
        getComponents: () => [],
        getTokenSuggestions: () => ({}),
      }
    );

    expect(result.inspected).toBe(true);
    expect(result.discovery?.inspectionError).toBeDefined();
    expect(result.discovery?.inspectionError?.code).toBe("CRAWL_ERROR");
    expect(result.discovery?.inspectionError?.message).toBe(
      "Failed to crawl page"
    );
    expect(result.discovery?.inspectionError?.detail).toBe(
      "Blocked by robots.txt"
    );
  });

  it("omits inspectionError from discovery when not present", async () => {
    const mockLoadBundle = vi.fn(() =>
      makeLoadResult({
        ok: true,
        componentCount: 2,
        tokenSuggestionCount: 5,
        errors: [] as string[],
      })
    );

    const mockClient: Stage1McpClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => ({
        manifest: {},
        artifacts: [],
      })) as Stage1McpClient["getArtifact"],
      inspectApp: vi.fn(),
      inspectSurface: vi.fn(),
    };

    const result = await runInspectionPipeline(makeInspectionResult(), {
      client: mockClient,
      loadBundle: mockLoadBundle,
      getComponents: () => [{ name: "A" }, { name: "B" }],
      getTokenSuggestions: () => ({ "colors.primary": "#111" }),
    });

    expect(result.inspected).toBe(true);
    expect(result.discovery?.inspectionError).toBeUndefined();
  });

  it("uses type-safe InspectionPipelineResult return shape", async () => {
    const result: InspectionPipelineResult = await runInspectionPipeline({
      run: null,
      payload: null,
    });

    // Type check — these properties must exist
    expect(typeof result.inspected).toBe("boolean");
    expect("discovery" in result).toBe(true);
  });
});
