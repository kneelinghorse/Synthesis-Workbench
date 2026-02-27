import { describe, expect, it, vi } from "vitest";

import {
  runInspectionPipeline,
  type InspectionPipelineResult,
} from "./inspection-pipeline";
import type { Stage1InspectionResult } from "@/lib/mcp/stage1-client";

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

describe("runInspectionPipeline", () => {
  it("returns inspected=false when run is null", async () => {
    const result = await runInspectionPipeline({
      run: null,
      payload: null,
    });

    expect(result.inspected).toBe(false);
    expect(result.discovery).toBeNull();
    expect(result.error).toBe("Inspection did not produce a run reference.");
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
    const mockLoadBundle = vi.fn(() => ({
      ok: true,
      componentCount: 3,
      tokenSuggestionCount: 8,
      errors: [] as string[],
    }));

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
    const mockClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => mockBundle),
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
    const mockLoadBundle = vi.fn(() => ({
      ok: false,
      componentCount: 1,
      tokenSuggestionCount: 0,
      errors: ["Unknown artifact format"],
    }));

    const mockClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => ({ manifest: {}, artifacts: [] })),
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
    const mockClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => {
        throw new Error("MCP connection refused");
      }),
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
    const mockLoadBundle = vi.fn(() => ({
      ok: true,
      componentCount: 0,
      tokenSuggestionCount: 0,
      errors: [] as string[],
    }));

    const mockClient = {
      listRuns: vi.fn(),
      getArtifact: vi.fn(async () => ({ manifest: {}, artifacts: [] })),
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
