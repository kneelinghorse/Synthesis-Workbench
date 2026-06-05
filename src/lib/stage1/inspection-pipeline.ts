import {
  type Stage1InspectionError,
  type Stage1InspectionResult,
  type Stage1McpClient,
} from "@/lib/mcp/stage1-client";
import { buildStage1BundleFromRun } from "@/lib/stage1/bundle-loader";
import { useStage1BundleStore } from "@/lib/stores/stage1-bundle";
import type {
  Stage1BundleLoadResult,
  Stage1BundlePayload,
} from "@/types/stage1-bundle";

/**
 * Summary of what was discovered and loaded from an inspection.
 * Flat structure so the agent can parse it directly from the tool result.
 */
export type DiscoverySummary = {
  bundleLoaded: boolean;
  componentCount: number;
  tokenSuggestionCount: number;
  discoveredComponents: string[];
  tokenPaths: string[];
  errors: string[];
  inspectionError?: Stage1InspectionError;
  hasEnrichedTokens: boolean;
  compositionPatternCount: number;
};

export type InspectionPipelineResult = {
  /** Whether the inspection itself produced a valid run reference. */
  inspected: boolean;
  /** Discovery summary, null if bundle loading was skipped or failed. */
  discovery: DiscoverySummary | null;
  /** Error message if any step failed. */
  error?: string;
  /** Structured error from the upstream inspection, if available. */
  inspectionError?: Stage1InspectionError;
};

export type InspectionPipelineOptions = {
  /** Override the Stage1 MCP client (for testing). */
  client?: Stage1McpClient;
  /** Override the bundle loader function (for testing). */
  loadBundle?: (input: Stage1BundlePayload | string) => Stage1BundleLoadResult;
  /** Override the component name reader (for testing). */
  getComponents?: () => { name: string }[];
  /** Override the token suggestion reader (for testing). */
  getTokenSuggestions?: () => Record<string, string>;
};

/**
 * Chains an inspection result into automatic bundle loading.
 *
 * Flow:
 * 1. Extract run reference from inspection result
 * 2. Fetch artifacts (token_guess, component_clusters, style_fingerprint)
 * 3. Assemble into Stage1BundlePayload
 * 4. Load into Workbench stores
 * 5. Return discovery summary for the agent
 */
export async function runInspectionPipeline(
  inspectionResult: Stage1InspectionResult,
  options?: InspectionPipelineOptions
): Promise<InspectionPipelineResult> {
  const run = inspectionResult.run;

  if (!run) {
    const upstreamDetail =
      inspectionResult.error?.message ?? inspectionResult.message;
    const errorCode = inspectionResult.error?.code;
    const prefix = errorCode ? `[${errorCode}] ` : "";
    return {
      inspected: false,
      discovery: null,
      error: upstreamDetail
        ? `${prefix}${upstreamDetail}`
        : "Inspection did not produce a run reference.",
      inspectionError: inspectionResult.error,
    };
  }

  if (!run.runDir) {
    return {
      inspected: true,
      discovery: null,
      error:
        "Inspection run has no output directory — cannot extract artifacts.",
    };
  }

  try {
    // Step 1: Fetch artifacts and assemble bundle
    const bundle = await buildStage1BundleFromRun(run, options?.client);

    // Step 2: Load bundle into store
    const loadBundle =
      options?.loadBundle ?? useStage1BundleStore.getState().loadBundle;
    const loadResult = loadBundle(bundle);

    // Step 3: Read discovery details from store
    const getComponents =
      options?.getComponents ??
      (() => useStage1BundleStore.getState().components);
    const getTokenSuggestions =
      options?.getTokenSuggestions ??
      (() => useStage1BundleStore.getState().tokenSuggestions);

    const components = getComponents();
    const tokenSuggestions = getTokenSuggestions();

    const hasEnrichedTokens =
      Object.keys(loadResult.enrichedTokens ?? {}).length > 0;
    const compositionPatternCount =
      (loadResult.compositionPatterns ?? []).length;

    return {
      inspected: true,
      discovery: {
        bundleLoaded: loadResult.ok,
        componentCount: loadResult.componentCount,
        tokenSuggestionCount: loadResult.tokenSuggestionCount,
        discoveredComponents: components.map((c) => c.name),
        tokenPaths: Object.keys(tokenSuggestions),
        errors: loadResult.errors,
        inspectionError: inspectionResult.error,
        hasEnrichedTokens,
        compositionPatternCount,
      },
    };
  } catch (err) {
    return {
      inspected: true,
      discovery: null,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load discovery bundle.",
    };
  }
}
