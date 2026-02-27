import type { DataContext } from "@/lib/engine/data-binding";
import type { CompositionError } from "@/lib/engine/composition-renderer";
import { evaluateFoundryFragmentContract } from "@/lib/engine/foundry-fragment-contract";
import {
  buildFoundryFragmentRenderInput,
  composeDocumentFromFoundryFragments,
  mapFoundryValidationErrors,
  parseFoundryFragmentRenderOutput,
} from "@/lib/engine/foundry-fragment-adapter";
import type { FoundryMcpClient } from "@/lib/mcp/foundry-client";
import { renderStaticDocument } from "@/lib/preview/static-renderer";
import type { DesignDocument } from "@/types/document-model";

export const PREVIEW_RENDERER_MODES = [
  "fragments",
  "composition",
] as const;

export type PreviewRendererMode = (typeof PREVIEW_RENDERER_MODES)[number];
export type LivePreviewStatus = "live" | "dry-run";

export type PreviewRenderResult = {
  html: string;
  errors: CompositionError[];
  foundryStatus: LivePreviewStatus;
  mode: PreviewRendererMode;
};

export interface PreviewRenderer {
  mode: PreviewRendererMode;
  render: (
    document: DesignDocument,
    client: FoundryMcpClient,
    options?: {
      dataContext?: DataContext;
    },
  ) => Promise<PreviewRenderResult>;
}

const toContractErrors = (
  checks: ReturnType<typeof evaluateFoundryFragmentContract>["checks"],
): CompositionError[] =>
  checks
    .filter((check) => !check.pass)
    .map((check) => ({
      componentId: "_fragments",
      componentRef: "_fragments",
      message: `${check.id}: ${check.detail}`,
    }));

const staticFallback = (
  document: DesignDocument,
  errors: CompositionError[],
  options?: { dataContext?: DataContext },
): PreviewRenderResult => ({
  html: renderStaticDocument(document, { dataContext: options?.dataContext }),
  errors,
  foundryStatus: "dry-run",
  mode: "fragments",
});

const fragmentPreviewRenderer: PreviewRenderer = {
  mode: "fragments",
  async render(document, client, options) {
    const prepared = buildFoundryFragmentRenderInput(document, {
      dataContext: options?.dataContext,
    });

    const validation = await client.validate(prepared.validationInput);
    if (!validation.valid) {
      const validationErrors = mapFoundryValidationErrors(
        validation,
        prepared.componentIndex,
      );
      return staticFallback(document, [
        ...prepared.bindingErrors,
        ...validationErrors,
      ], options);
    }

    const output = await client.render(prepared.renderInput);

    const contract = evaluateFoundryFragmentContract(output.raw, {
      expectedNodeIds: prepared.componentIndex.map((entry) => entry.id),
      acceptedIsolationModes: ["none", "isolated", "global-failure"],
      expectedStrict: false,
    });

    if (!contract.pass) {
      return staticFallback(document, [
        ...prepared.bindingErrors,
        ...toContractErrors(contract.checks),
      ], options);
    }

    const parsedOutput = parseFoundryFragmentRenderOutput(
      output.raw,
      prepared.componentIndex,
    );
    const composed = composeDocumentFromFoundryFragments(document, parsedOutput);

    return {
      html: composed.html,
      errors: [...prepared.bindingErrors, ...composed.errors],
      foundryStatus: "live",
      mode: "fragments",
    };
  },
};

const compositionAliasPreviewRenderer: PreviewRenderer = {
  mode: "composition",
  async render(document, client, options) {
    const result = await fragmentPreviewRenderer.render(document, client, options);
    return {
      ...result,
      mode: "composition",
    };
  },
};

export const getPreviewRenderer = (
  mode: PreviewRendererMode = "fragments",
): PreviewRenderer => {
  if (mode === "composition") {
    return compositionAliasPreviewRenderer;
  }
  return fragmentPreviewRenderer;
};

// ---------------------------------------------------------------------------
// Foundry availability error detection
// ---------------------------------------------------------------------------

const UNAVAILABLE_ERROR_CODES = new Set([
  "MISSING_BASE_URL",
  "CONNECTION_FAILED",
  "NETWORK_ERROR",
  "TIMEOUT",
]);

export const isFoundryUnavailableError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && UNAVAILABLE_ERROR_CODES.has(code);
};
