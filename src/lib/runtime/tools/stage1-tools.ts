import type {
  Stage1BundleLoadResult,
  Stage1BundlePayload,
} from "@/types/stage1-bundle";

export const LOAD_BUNDLE_TOOL_NAME = "load_bundle";

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
