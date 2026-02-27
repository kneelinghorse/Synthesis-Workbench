import type {
  Stage1BundleLoadResult,
  Stage1BundlePayload,
} from "@/types/stage1-bundle";
import type { Stage1InspectionResult } from "@/lib/mcp/stage1-client";
import type { DiscoverySummary } from "@/lib/stage1/inspection-pipeline";

export const LOAD_BUNDLE_TOOL_NAME = "load_bundle";
export const INSPECT_APP_TOOL_NAME = "inspect_app";
export const INSPECT_SURFACE_TOOL_NAME = "inspect_surface";

export type LoadBundleToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  projectSlug?: string;
  bundleJson?: string;
  bundle?: Stage1BundlePayload;
};

export type LoadBundleToolResult = {
  loaded: boolean;
  componentCount: number;
  tokenSuggestionCount: number;
  errors?: string[];
  resolvedAt: string;
};

export const buildLoadBundleToolResult = (
  result: Stage1BundleLoadResult
): LoadBundleToolResult => ({
  loaded: result.ok,
  componentCount: result.componentCount,
  tokenSuggestionCount: result.tokenSuggestionCount,
  errors: result.errors.length ? result.errors : undefined,
  resolvedAt: new Date().toISOString(),
});

// ─── Inspect App ───────────────────────────────────────────────

export type InspectAppToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  url: string;
  name?: string;
  crawlDepth?: number;
  include?: string[];
  components?: boolean;
  seedRoutes?: string[];
};

export type InspectAppToolResult = {
  inspected: boolean;
  url: string;
  runId: string | null;
  runDir: string | null;
  hostname: string | null;
  message?: string;
  errors?: string[];
  resolvedAt: string;
  /** Populated by the inspection pipeline when bundle auto-loading succeeds. */
  discovery?: DiscoverySummary;
};

// ─── Inspect Surface ───────────────────────────────────────────

export type InspectSurfaceToolArgs = {
  requestId: string;
  title?: string;
  prompt?: string;
  url: string;
  name?: string;
  passes?: string[];
  seedRoutes?: string[];
};

export type InspectSurfaceToolResult = {
  inspected: boolean;
  url: string;
  runId: string | null;
  runDir: string | null;
  hostname: string | null;
  message?: string;
  errors?: string[];
  resolvedAt: string;
  /** Populated by the inspection pipeline when bundle auto-loading succeeds. */
  discovery?: DiscoverySummary;
};

// ─── Shared result builder for inspection tools ────────────────

export const buildInspectToolResult = (
  result: Stage1InspectionResult,
  url: string,
  options?: { error?: string; discovery?: DiscoverySummary }
): InspectAppToolResult & InspectSurfaceToolResult => ({
  inspected: !options?.error && result.run !== null,
  url,
  runId: result.run?.runId ?? null,
  runDir: result.run?.runDir ?? null,
  hostname: result.run?.hostname ?? null,
  message: result.message,
  errors: options?.error ? [options.error] : undefined,
  discovery: options?.discovery ?? undefined,
  resolvedAt: new Date().toISOString(),
});
